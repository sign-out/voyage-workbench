// Owned-world pagination. The API's page index is zero-based; totalCount is
// optional because older Creator API responses may omit pagination metadata.
export class RemoteWorldPages {
  constructor(fetchPage, onChange = () => {}) {
    this.fetchPage = fetchPage;
    this.onChange = onChange;
    this.generation = 0;
    this.reset();
  }

  reset() {
    this.generation++;
    this.worlds = [];
    this.ids = new Set();
    this.nextPage = 0;
    this.total = null;
    this.loading = false;
    this.started = false;
    this.done = false;
    this.error = '';
    this.onChange(this);
  }

  async load(restart = false) {
    if (restart) this.reset();
    if (this.loading || this.done) return;
    const generation = this.generation;
    const page = this.nextPage;
    this.loading = true;
    this.started = true;
    this.error = '';
    this.onChange(this);
    try {
      const response = await this.fetchPage(page);
      if (generation !== this.generation) return;
      const data = response?.data ?? response;
      const worlds = data?.worlds;
      if (!Array.isArray(worlds) || worlds.some(world => !world || typeof world !== 'object' || Array.isArray(world))) {
        throw new Error('Voyage returned an unexpected world list. Try listing again.');
      }
      const total = data.totalCount;
      if (Number.isSafeInteger(total) && total >= 0) this.total = total;
      let added = 0;
      for (const world of worlds) {
        const id = String(world.shortId || world.id || '');
        if (!id || this.ids.has(id)) continue;
        this.ids.add(id);
        this.worlds.push(world);
        added++;
      }
      this.nextPage = page + 1;
      // With no advertised total, request until an empty/no-progress page.
      // A repeated page also stops a misbehaving API from looping forever.
      this.done = worlds.length === 0 || added === 0 || (this.total !== null && this.worlds.length >= this.total);
    } catch (error) {
      if (generation !== this.generation) return;
      this.error = error?.message || 'Could not load owned worlds.';
    } finally {
      if (generation === this.generation) {
        this.loading = false;
        this.onChange(this);
      }
    }
  }
}

export function initRemoteWorldList({api, listButton, listContainer, onSelect}) {
  const controls = document.createElement('div');
  const summary = document.createElement('p');
  summary.setAttribute('role', 'status');
  summary.setAttribute('aria-live', 'polite');
  const error = document.createElement('p');
  error.setAttribute('role', 'alert');
  error.className = 'dialog-error';
  error.hidden = true;
  const more = document.createElement('button');
  more.type = 'button';
  more.textContent = 'Load more';
  more.hidden = true;
  controls.append(summary, error, more);
  listContainer.after(controls);

  const pages = new RemoteWorldPages(page => api('/api/remote/list', {page}), state => {
    listButton.disabled = state.loading;
    listContainer.setAttribute('aria-busy', String(state.loading));
    listContainer.replaceChildren();
    for (const world of state.worlds) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = world.title || world.name || world.shortId || world.id;
      button.onclick = () => onSelect(world);
      listContainer.append(button);
    }
    summary.textContent = !state.started ? '' : state.loading && !state.worlds.length ? 'Loading owned worlds…' :
      !state.loading && state.done && !state.worlds.length ? 'No owned worlds found.' :
      `${state.worlds.length}${state.total === null ? '' : ` of ${state.total}`} world${state.worlds.length === 1 ? '' : 's'} loaded.${state.done && state.total !== null && state.worlds.length < state.total ? ' No additional worlds were returned. List again to refresh.' : ''}`;
    error.hidden = !state.error;
    error.textContent = state.error;
    more.hidden = !state.started || state.done;
    more.disabled = state.loading;
    more.textContent = state.loading ? 'Loading…' : state.error ? 'Retry loading' : 'Load more';
  });
  listButton.onclick = () => pages.load(true);
  more.onclick = () => pages.load();
  return {reset: () => pages.reset(), pages};
}
