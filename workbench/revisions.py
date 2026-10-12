"""Private, local Git history and isolated agent worktrees. Never contacts remotes."""
from contextlib import contextmanager
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import threading


_ID = re.compile(r"[A-Za-z0-9_-]+\Z")
_COMMIT = re.compile(r"[0-9a-fA-F]{7,64}\Z")
_LOCK_GUARD = threading.Lock()
_LOCKS = {}


class Revisions:
    def __init__(self, root: Path):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        for name in ("repos", "stages", "stage-registry"):
            directory = self.root / name
            if directory.is_symlink():
                raise ValueError("Revision directories cannot be symbolic links")
            directory.mkdir(exist_ok=True)

    @staticmethod
    def _id(value):
        if not isinstance(value, str) or not _ID.fullmatch(value):
            raise ValueError("IDs may contain only letters, digits, hyphens, and underscores")
        return value

    @contextmanager
    def _lock(self, project_id, namespace="project"):
        key = (str(self.root), namespace, self._id(project_id))
        with _LOCK_GUARD:
            lock = _LOCKS.setdefault(key, threading.RLock())
        with lock:
            yield

    def _repo(self, project_id):
        path = self.root / "repos" / self._id(project_id)
        if path.is_symlink() or path.resolve().parent != self.root / "repos":
            raise ValueError("Repository must remain inside the owned revision directory")
        return path

    @staticmethod
    def _git(path, *args, check=True):
        # Ignore ambient repository, config, identity, executable and tracing
        # overrides. All commands are local and never invoke network operations.
        env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
        env.update(GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_SYSTEM=os.devnull,
                   GIT_CONFIG_GLOBAL=os.devnull, GIT_ATTR_NOSYSTEM="1",
                   GIT_TERMINAL_PROMPT="0", GIT_PAGER="cat", LC_ALL="C")
        command = ["git", "-c", "core.hooksPath=" + os.devnull,
                   "-c", "core.attributesFile=" + os.devnull,
                   "-c", "core.autocrlf=false", "-c", "core.safecrlf=false",
                   "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false",
                   "-c", "commit.gpgSign=false", "-c", "tag.gpgSign=false",
                   "-c", "gc.auto=0", "-c", "maintenance.auto=false",
                   "-c", "user.name=Voyage Workbench",
                   "-c", "user.email=workbench@localhost", *args]
        result = subprocess.run(command, cwd=path, env=env, capture_output=True, timeout=30)
        if check and result.returncode:
            raise ValueError("Local Git operation failed: " + result.stderr.decode("utf-8", errors="replace").strip())
        return result

    @staticmethod
    def _write(path, text):
        if not isinstance(text, str):
            raise ValueError("World content must be UTF-8 text")
        data = text.encode("utf-8")
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".world-", delete=False) as handle:
                temporary = Path(handle.name)
                handle.write(data)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, path)
        finally:
            if temporary is not None and temporary.exists():
                temporary.unlink()

    def _head(self, path):
        return self._git(path, "rev-parse", "--verify", "HEAD").stdout.decode().strip()

    def _initialize(self, project_id):
        repo = self._repo(project_id)
        if not repo.exists():
            repo.mkdir()
        if not (repo / ".git").exists():
            if any(repo.iterdir()):
                raise ValueError("Refusing to initialize a nonempty repository directory")
            self._git(repo, "init", "--template=", "--initial-branch=main", ".")
        if (repo / ".git").is_symlink() or not (repo / ".git").is_dir():
            raise ValueError("Project repository metadata must be an owned directory")
        branch = self._git(repo, "symbolic-ref", "--quiet", "HEAD").stdout.decode().strip()
        if branch != "refs/heads/main":
            raise ValueError("Project repository must be on its main branch")
        return repo

    def _commit(self, path, text, reason, allow_empty=False):
        if not isinstance(reason, str) or not reason.strip() or "\x00" in reason:
            raise ValueError("Commit reason must be nonempty text without NUL characters")
        self._write(path / "world.json", text)
        self._git(path, "add", "--", "world.json")
        existing = self._git(path, "rev-parse", "--verify", "HEAD", check=False)
        if existing.returncode == 0 and not allow_empty:
            difference = self._git(path, "diff", "--cached", "--quiet", "--no-ext-diff", "--", "world.json", check=False)
            if difference.returncode == 0:
                return existing.stdout.decode().strip()
            if difference.returncode != 1:
                raise ValueError("Unable to inspect staged world changes")
        args = ["commit", "--no-verify", "--only", "-m", reason]
        if allow_empty:
            args.append("--allow-empty")
        self._git(path, *args, "--", "world.json")
        return self._head(path)

    def ensure(self, project_id, text):
        with self._lock(project_id):
            repo = self._initialize(project_id)
            exists = self._git(repo, "rev-parse", "--verify", "HEAD", check=False).returncode == 0
            return self._commit(repo, text, "Sync working copy" if exists else "Initial import")

    def commit(self, project_id, text, reason, allow_empty=False):
        with self._lock(project_id):
            repo = self._initialize(project_id)
            return self._commit(repo, text, reason, allow_empty)

    def history(self, project_id):
        with self._lock(project_id):
            repo = self._repo(project_id)
            if not (repo / ".git").exists():
                return []
            if self._git(repo, "rev-parse", "--verify", "main", check=False).returncode:
                return []
            output = self._git(repo, "log", "--format=%H%x00%B%x00%cI%x00", "main").stdout.decode("utf-8")
            fields = output.split("\x00")
            return [{"commit": fields[i].strip(), "reason": fields[i + 1].rstrip("\n"), "created": fields[i + 2].strip()} for i in range(0, len(fields) - 2, 3)]

    def read(self, project_id, commit):
        if not isinstance(commit, str) or not _COMMIT.fullmatch(commit):
            raise ValueError("Commit must be a hexadecimal Git identifier")
        with self._lock(project_id):
            repo = self._repo(project_id)
            if not (repo / ".git").exists():
                raise ValueError("Unknown project repository")
            resolved = self._git(repo, "rev-parse", "--verify", commit + "^{commit}").stdout.decode().strip()
            return self._git(repo, "show", resolved + ":world.json").stdout.decode("utf-8")

    def stage(self, project_id, run_id, text):
        self._id(run_id)
        with self._lock(project_id):
            # The global run lock prevents separate projects from claiming the
            # same worktree directory concurrently.
            with self._lock(run_id, "run"):
                path = self.root / "stages" / run_id
                registry = self.root / "stage-registry" / (run_id + ".json")
                if path.parent.resolve() != self.root / "stages":
                    raise ValueError("Stage directory must remain inside the revision root")
                if path.exists() or path.is_symlink() or registry.exists():
                    raise ValueError("Run already has a stage")
                base = self.ensure(project_id, text)
                branch = "agent/" + run_id
                self._git(self._repo(project_id), "worktree", "add", "-b", branch, str(path), "main")
                record = {"project_id": project_id, "path": str(path), "branch": branch, "baseCommit": base}
                self._write(registry, json.dumps(record))
                return {"path": str(path), "branch": branch, "baseCommit": base}

    def _stage(self, stage_path):
        candidate = Path(stage_path)
        if not candidate.is_absolute() or candidate.is_symlink():
            raise ValueError("Stage path must be an owned absolute worktree path")
        path = candidate.resolve()
        if path.parent != self.root / "stages":
            raise ValueError("Stage path is outside the owned revision directory")
        if not path.is_dir():
            raise ValueError("Stage worktree does not exist")
        run_id = self._id(path.name)
        registry = self.root / "stage-registry" / (run_id + ".json")
        if not registry.is_file() or registry.is_symlink():
            raise ValueError("Stage is not registered")
        record = json.loads(registry.read_text(encoding="utf-8"))
        project_id = self._id(record["project_id"])
        if record["path"] != str(path) or record["branch"] != "agent/" + run_id:
            raise ValueError("Invalid stage registration")
        common = self._git(path, "rev-parse", "--git-common-dir").stdout.decode().strip()
        if (path / common).resolve() != self._repo(project_id) / ".git":
            raise ValueError("Stage belongs to a different repository")
        branch = self._git(path, "symbolic-ref", "--quiet", "HEAD").stdout.decode().strip()
        if branch != "refs/heads/" + record["branch"]:
            raise ValueError("Stage branch does not match its registration")
        return path, project_id

    def stage_text(self, stage_path):
        path, project_id = self._stage(stage_path)
        with self._lock(project_id):
            world = path / "world.json"
            if world.is_symlink():
                raise ValueError("Stage world cannot be a symbolic link")
            return world.read_bytes().decode("utf-8")

    def stage_commit(self, stage_path, text, reason):
        path, project_id = self._stage(stage_path)
        with self._lock(project_id):
            return self._commit(path, text, reason)

    def stage_head(self, stage_path):
        path, project_id = self._stage(stage_path)
        with self._lock(project_id):
            return self._head(path)

    def import_changes(self, store, project_id, body):
        """Stage an external full document, then apply one recoverable revision.

        The HTTP caller also holds agent lifecycle locks to reject active runs.
        Numeric tokens and whitespace are never reserialized. The import is
        based on the current local revision, not a guessed historical base.
        """
        import time
        import uuid
        from . import document
        from .server import Conflict

        self._id(project_id)
        text = body.get('text')
        if not isinstance(text, str):
            raise ValueError('text must be a JSON text string')
        document.parse(text)  # Includes duplicate-key and depth checks.
        reason = body.get('reason')
        if reason is None:
            filename = body.get('filename')
            reason = 'Import external JSON' + (': ' + filename if isinstance(filename, str) and filename else '')
        if not isinstance(reason, str) or not reason.strip() or '\x00' in reason or len(reason) > 500:
            raise ValueError('Import reason must contain 1–500 characters without NUL')
        applied = None
        previous = None
        base = None
        with store.lifecycle_lock:
            try:
                with store.connect() as db:
                    db.execute('BEGIN IMMEDIATE')
                    current = store.project(db, project_id)
                    if current['archived']:
                        raise Conflict('Restore this project from trash before importing changes')
                    if type(body.get('version')) is not int or body['version'] != current['version']:
                        raise Conflict('Project changed; reload before importing changes')
                    previous = current['text']
                    # An invalid draft must remain recoverable too. Its exact
                    # contents have a Git/checkpoint restore point; semantic
                    # comparison is unavailable until the replacement parses.
                    try:
                        changes = document.diff(previous, text)
                    except ValueError:
                        changes = [{'path': [], 'kind': 'replace', 'before': previous, 'after': text}]
                    with self._lock(project_id):
                        stage = self.stage(project_id, 'import-' + uuid.uuid4().hex, previous)
                        base = stage['baseCommit']
                        commit = self._commit(Path(stage['path']), text, reason, allow_empty=True)
                        store.checkpoint(db, project_id, previous, 'Before external JSON import', record_revision=False)
                        store.checkpoint(db, project_id, text, reason, record_revision=False)
                        db.execute('UPDATE projects SET name=?,text=?,version=version+1,updated=? WHERE id=?',
                                   (store.name_for(text, current['name']), text, time.time(), project_id))
                        result = store.project(db, project_id)
                        # The stage starts at main; ff-only prevents accidental
                        # merges if a separate revision operation moved it.
                        self._git(self._repo(project_id), 'merge', '--ff-only', '--no-edit', commit)
                        applied = commit
                return {'project': result, 'changes': changes, 'commit': commit, 'baseCommit': base}
            except Exception:
                # Compensate for a failed database commit without erasing any
                # later revision. The isolated imported commit remains intact.
                if applied is not None:
                    with self._lock(project_id):
                        repo = self._repo(project_id)
                        if self._head(repo) == applied:
                            self._git(repo, 'update-ref', 'refs/heads/main', base, applied)
                            self._git(repo, 'read-tree', base)
                            self._write(repo / 'world.json', previous)
                raise
