package com.meggy.app

import android.app.Application
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

class MeggyApp : Application() {
    
    companion object {
        const val BASE_URL = "https://educa.eu.org"
        lateinit var okHttpClient: OkHttpClient
            private set
    }
    
    override fun onCreate() {
        super.onCreate()
        okHttpClient = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .followRedirects(false)  // Capture 302 for login cookie
            .build()
    }
}
