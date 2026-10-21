package dev.voyage.workbench;

final class AgentTaskTarget {
    final String projectId;
    final String taskId;
    final String attempt;

    AgentTaskTarget(String projectId, String taskId, String attempt) {
        this.projectId = projectId;
        this.taskId = taskId;
        this.attempt = attempt;
    }

    boolean matches(String projectId, String taskId, String attempt) {
        return present(this.projectId) && present(this.taskId) && present(this.attempt)
            && this.projectId.equals(projectId) && this.taskId.equals(taskId) && this.attempt.equals(attempt);
    }

    boolean canStop(String state, String requestedAttempt) {
        return matches(projectId, taskId, attempt)
            && (requestedAttempt == null || attempt.equals(requestedAttempt))
            && ("PREPARED".equals(state) || "RUNNING".equals(state));
    }

    private static boolean present(String value) {
        return value != null && !value.isEmpty();
    }
}
