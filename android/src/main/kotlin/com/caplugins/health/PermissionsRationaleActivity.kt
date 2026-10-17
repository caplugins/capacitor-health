package com.caplugins.health

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import com.getcapacitor.CapConfig

/**
 * The default permissions-rationale screen (decision #19). Health Connect won't show its permission dialog
 * for an app without one (T08 A2), and links to it as the app's privacy policy. It opens
 * `plugins.CapacitorHealth.privacyPolicyUrl` from the Capacitor config and closes. Apps that want their own
 * screen remove this one (and its alias) with `tools:node="remove"`.
 */
class PermissionsRationaleActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val url = runCatching { CapConfig.loadDefault(this).getPluginConfiguration("CapacitorHealth").getString("privacyPolicyUrl") }.getOrNull()
        if (!url.isNullOrBlank()) {
            try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            } catch (_: ActivityNotFoundException) {
                HealthLog.debug("No app can open the privacy policy URL")
            }
        }
        finish()
    }
}
