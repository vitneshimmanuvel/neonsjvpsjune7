package com.agtrust.recordbook;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Force high refresh rate display mode (120Hz/90Hz) on supported devices for buttery smooth 120 FPS scrolling
        try {
            WindowManager.LayoutParams layoutParams = getWindow().getAttributes();
            layoutParams.preferredRefreshRate = 120.0f;
            getWindow().setAttributes(layoutParams);
        } catch (Exception e) {
            // Fallback gracefully if preferredRefreshRate API is not supported on this platform
            e.printStackTrace();
        }
    }
}
