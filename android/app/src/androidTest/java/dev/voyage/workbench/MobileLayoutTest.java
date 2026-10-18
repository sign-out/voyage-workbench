package dev.voyage.workbench;

import android.content.Context;
import android.content.Intent;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Exercises the actual Android WebView and production CSS, not a simulated layout. */
@RunWith(AndroidJUnit4.class)
public class MobileLayoutTest {
    private MainActivity activity;

    private String evaluate(String script) throws Exception {
        CountDownLatch complete = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
            activity.getBridge().getWebView().evaluateJavascript(script, value -> {
                result.set(value);
                complete.countDown();
            }));
        assertTrue("WebView evaluation timed out", complete.await(5, TimeUnit.SECONDS));
        return result.get();
    }

    private void waitFor(String expression) throws Exception {
        long deadline = System.currentTimeMillis() + 20000;
        while (System.currentTimeMillis() < deadline) {
            if ("true".equals(evaluate("Boolean(" + expression + ")"))) return;
            Thread.sleep(100);
        }
        fail("UI did not become ready: " + expression);
    }

    private void openProject(JSONObject fields) throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Host host = new Host(context);
        String projectId = host.store.create("Mobile layout regression", fields.toString())
            .getJSONObject("project").getString("id");
        Intent intent = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        activity = (MainActivity) InstrumentationRegistry.getInstrumentation().startActivitySync(intent);
        waitFor("document.querySelector('.workspace-tools')");
        evaluate("localStorage.setItem('voyage-project'," + JSONObject.quote(projectId) + ");location.reload()");
        waitFor("document.querySelector('.content-group-other')");
    }

    @Test public void expandedContentStaysScrollableAboveTheBottomBar() throws Exception {
        JSONObject fields = new JSONObject();
        for (int index = 0; index < 40; index++) fields.put("testField" + index, "Value " + index);
        openProject(fields);
        evaluate("document.querySelector('.content-group-other').open=true");
        waitFor("document.querySelectorAll('.content-group-other .content-field').length===40");
        evaluate("document.querySelector('.children').scrollTop=100000");
        JSONObject layout = new JSONObject(evaluate("(()=>{const list=document.querySelector('.children'),"
            + "last=list.querySelector('.content-group-other .content-field:last-child'),"
            + "bar=document.querySelector('.mobile-workspace-mode');return {width:innerWidth,"
            + "scrollTop:list.scrollTop,listBottom:list.getBoundingClientRect().bottom,"
            + "lastBottom:last.getBoundingClientRect().bottom,barTop:bar.getBoundingClientRect().top};})()"));
        assertTrue("Run on a phone viewport: " + layout, layout.getInt("width") <= 760);
        assertTrue("Expanded fields cannot scroll: " + layout, layout.getDouble("scrollTop") > 0);
        assertTrue("Content viewport extends behind the bottom bar: " + layout,
            layout.getDouble("listBottom") <= layout.getDouble("barTop") + 1);
        assertTrue("Final field is unreachable: " + layout,
            layout.getDouble("lastBottom") <= layout.getDouble("barTop") + 1);
    }

    @Test public void compactEditorViewportLeavesFocusedTextVisibleAboveActions() throws Exception {
        openProject(new JSONObject().put("testField", "Keyboard editing"));
        evaluate("document.querySelector('.content-group-other').open=true;"
            + "document.querySelector('.content-group-other .content-field').click()");
        waitFor("document.querySelector('.structured-editor textarea')");
        double initialHeight = Double.parseDouble(evaluate("innerHeight"));
        // Match the viewport reduction caused by the real Android keyboard. This avoids
        // depending on emulator hardware-keyboard preferences in the regression test.
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            android.webkit.WebView view = activity.getBridge().getWebView();
            android.view.ViewGroup.LayoutParams params = view.getLayoutParams();
            params.height = view.getHeight() - Math.round(300 * view.getResources().getDisplayMetrics().density);
            view.setLayoutParams(params);
        });
        waitFor("innerHeight<" + (initialHeight - 100));
        evaluate("document.querySelector('.structured-editor textarea').focus()");
        JSONObject layout = new JSONObject(evaluate("(()=>{const field=document.querySelector('.structured-editor textarea'),"
            + "actions=document.querySelector('.editor-actions'),bar=document.querySelector('.mobile-workspace-mode'),"
            + "r=field.getBoundingClientRect();return {fieldTop:r.top,fieldBottom:r.bottom,"
            + "actionsTop:actions.getBoundingClientRect().top,barTop:bar.getBoundingClientRect().top,"
            + "visibleHeight:Math.max(0,Math.min(r.bottom,actions.getBoundingClientRect().top,"
            + "bar.getBoundingClientRect().top)-Math.max(r.top,0))};})()"));
        assertTrue("Keyboard/action strip hides the focused text: " + layout,
            layout.getDouble("visibleHeight") >= 36);
    }

    @Test public void rotationKeepsFocusedDraftVisible() throws Exception {
        openProject(new JSONObject().put("testField", "Draft survives rotation"));
        try {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
                activity.setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT));
            waitFor("innerHeight>innerWidth");
            evaluate("document.querySelector('.content-group-other').open=true;"
                + "document.querySelector('.content-group-other .content-field').click()");
            waitFor("document.querySelector('.structured-editor textarea')");
            waitFor("document.hasFocus()");
            evaluate("document.querySelector('.structured-editor textarea').focus()");
            waitFor("document.activeElement===document.querySelector('.structured-editor textarea')");
            Thread.sleep(100);
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
                activity.setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE));
            waitFor("innerWidth>innerHeight");
            // Allow the resize event and the resulting animation-frame layout to complete.
            waitFor("document.querySelector('.editor-main').clientHeight<400");
            Thread.sleep(300);
            JSONObject layout = new JSONObject(evaluate("(()=>{const field=document.querySelector('.structured-editor textarea'),"
                + "r=field.getBoundingClientRect(),editor=document.querySelector('.editor-main').getBoundingClientRect(),"
                + "actions=document.querySelector('.editor-actions').getBoundingClientRect();"
                + "return {focused:document.activeElement===field,value:field.value,top:r.top,editorTop:editor.top,"
                + "visible:Math.max(0,Math.min(r.bottom,editor.bottom,actions.top)-Math.max(r.top,editor.top))};})()"));
            assertTrue("Rotation dropped field focus: " + layout, layout.getBoolean("focused"));
            assertEquals("Draft survives rotation", layout.getString("value"));
            assertTrue("Rotation covered the focused draft: " + layout, layout.getDouble("visible") >= 36);
            assertTrue("Rotation scrolled the first text line away: " + layout,
                layout.getDouble("top") >= layout.getDouble("editorTop") - 1);
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                android.webkit.WebView view = activity.getBridge().getWebView();
                android.view.ViewGroup.LayoutParams params = view.getLayoutParams();
                params.height = Math.round(200 * view.getResources().getDisplayMetrics().density);
                view.setLayoutParams(params);
            });
            waitFor("innerHeight<250");
            evaluate("document.querySelector('.structured-editor textarea').focus()");
            Thread.sleep(300);
            JSONObject keyboard = new JSONObject(evaluate("(()=>{const r=document.querySelector('.structured-editor textarea').getBoundingClientRect(),"
                + "editor=document.querySelector('.editor-main').getBoundingClientRect(),"
                + "actions=document.querySelector('.editor-actions').getBoundingClientRect();"
                + "return {height:innerHeight,actionsTop:actions.top,actionsBottom:actions.bottom,"
                + "visible:Math.max(0,Math.min(r.bottom,editor.bottom,actions.top)-Math.max(r.top,editor.top))};})()"));
            assertTrue("Landscape keyboard covers the focused draft: " + keyboard, keyboard.getDouble("visible") >= 36);
            assertTrue("Landscape actions leave the viewport: " + keyboard,
                keyboard.getDouble("actionsTop") >= 0 && keyboard.getDouble("actionsBottom") <= keyboard.getDouble("height") + 1);
        } finally {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                android.webkit.WebView view = activity.getBridge().getWebView();
                android.view.ViewGroup.LayoutParams params = view.getLayoutParams();
                params.height = android.view.ViewGroup.LayoutParams.MATCH_PARENT;
                view.setLayoutParams(params);
                activity.setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
            });
        }
    }
}
