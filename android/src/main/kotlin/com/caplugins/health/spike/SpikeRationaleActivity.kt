package com.caplugins.health.spike

import android.app.Activity
import android.os.Bundle
import android.widget.TextView

// M0 spike (decision #25): the smallest rationale screen Health Connect accepts. Replaced in T14 (#19).
class SpikeRationaleActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(TextView(this).apply { text = "Spike rationale: ${intent?.action}" })
    }
}
