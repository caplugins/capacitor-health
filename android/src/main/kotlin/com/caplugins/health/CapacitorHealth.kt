package com.caplugins.health

import com.getcapacitor.Logger

class CapacitorHealth {

    fun echo(value: String): String {
        Logger.info("Echo", value)

        return value
    }
}
