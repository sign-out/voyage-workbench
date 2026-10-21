package dev.voyage.workbench;

import org.junit.Test;
import static org.junit.Assert.*;

public class AgentTaskTargetTest {
    @Test public void stopsOnlyTheExactProjectTaskAndAttempt() {
        AgentTaskTarget target = new AgentTaskTarget("project", "A", "new");
        assertTrue(target.matches("project", "A", "new"));
        assertFalse(target.matches("project", "B", "new"));
        assertFalse(target.matches("other", "A", "new"));
        assertFalse(target.matches("project", "A", "old"));
        assertFalse(target.matches("project", "A", null));
    }

    @Test public void validatesHostTargetsAndOptionalAttempt() {
        AgentTaskTarget target = new AgentTaskTarget("project", "A", "new");
        assertTrue(target.canStop("PREPARED", null));
        assertTrue(target.canStop("RUNNING", "new"));
        assertFalse(target.canStop("RUNNING", "old"));
        for (String state : new String[]{"COMPLETED", "FAILED", "CANCELED"}) {
            assertFalse(target.canStop(state, null));
        }
    }

    @Test public void incompleteIdentityNeverMatchesEvenItself() {
        for (AgentTaskTarget target : new AgentTaskTarget[]{
            new AgentTaskTarget(null, "A", "new"),
            new AgentTaskTarget("project", null, "new"),
            new AgentTaskTarget("project", "A", null),
            new AgentTaskTarget("", "A", "new"),
            new AgentTaskTarget("project", "", "new"),
            new AgentTaskTarget("project", "A", "")
        }) {
            assertFalse(target.matches(target.projectId, target.taskId, target.attempt));
            assertFalse(target.canStop("PREPARED", null));
        }
    }
}
