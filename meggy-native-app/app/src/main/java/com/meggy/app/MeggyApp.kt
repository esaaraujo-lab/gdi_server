package com.meggy.app

import android.app.Application
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import java.util.concurrent.TimeUnit

/**
 * Meggy Application — holds the OkHttp singleton and global app state.
 *
 * The OkHttp client is configured with:
 *   - 30s connect/read/write timeouts (large video file listing can be slow)
 *   - Cookie jar that delegates to [com.meggy.app.util.SessionManager] for the session cookie
 *   - No auto-redirect handling on login (we capture the Set-Cookie from the 302 manually)
 */
class MeggyApp : Application() {

    val client: OkHttpClient by lazy { buildClient() }

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    private fun buildClient(): OkHttpClient {
        val builder = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .followRedirects(false)
            .followSslRedirects(false)
            .retryOnConnectionFailure(true)
        // Debug logging — stripped from release builds by ProGuard (no-op class references)
        if (BuildConfig.DEBUG) {
            val logging = HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC }
            builder.addInterceptor(logging)
        }
        return builder.build()
    }

    companion object {
        @Volatile
        lateinit var instance: MeggyApp
            private set

        /** Base URL of the Meggy / GDI worker. Never include a trailing slash here. */
        const val BASE_URL: String = "https://educa.eu.org"
    }
}
