package dev.voyage.workbench;
import com.getcapacitor.BridgeActivity;import android.os.Bundle;
public class MainActivity extends BridgeActivity { public void onCreate(Bundle state){registerPlugin(WorkbenchPlugin.class);super.onCreate(state);} }
