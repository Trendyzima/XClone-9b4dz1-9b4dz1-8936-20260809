package com.xclone.app

import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.widget.Toast
import com.getcapacitor.BridgeActivity

/** Native shell; the existing React/Tailwind bundle remains the visual source of truth. */
class MainActivity : BridgeActivity() {
    private var lastBackPressed = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        applyImmersiveMode()
    }

    override fun onResume() {
        super.onResume()
        applyImmersiveMode()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode != KeyEvent.KEYCODE_BACK) return super.onKeyDown(keyCode, event)
        if (bridge.webView.canGoBack()) {
            bridge.webView.goBack()
            return true
        }
        val now = System.currentTimeMillis()
        if (lastBackPressed + 2000 > now) finish()
        else {
            Toast.makeText(this, "Press back again to exit", Toast.LENGTH_SHORT).show()
            lastBackPressed = now
        }
        return true
    }

    private fun applyImmersiveMode() {
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
            View.SYSTEM_UI_FLAG_FULLSCREEN or
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
    }
}
