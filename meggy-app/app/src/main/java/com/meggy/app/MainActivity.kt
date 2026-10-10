package com.meggy.app

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : ComponentActivity() {
    
    private lateinit var webView: WebView
    
    companion object {
        private const val SITE_URL = "https://educa.eu.org/"
    }
    
    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Fullscreen immersive mode
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).let { controller ->
            controller.hide(WindowInsetsCompat.Type.systemBars())
            controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        
        webView = WebView(this).apply {
            // Fundo preto ( tema dark)
            setBackgroundColor(android.graphics.Color.BLACK)
            
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                cacheMode = WebSettings.LOAD_DEFAULT
                allowFileAccess = true
                allowContentAccess = true
                mediaPlaybackRequiresUserGesture = false
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                userAgentStr = "$userAgentString MeggyApp/1.0"
                // Zoom
                setSupportZoom(true)
                builtInZoomControls = true
                displayZoomControls = false
                // Viewport
                useWideViewPort = true
                loadWithOverviewMode = true
            }
            
            // Cookies — persistir login entre sessões
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
            
            // WebViewClient — abrir links internos no app
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    return false // deixar o WebView carregar tudo
                }
            }
            
            // WebChromeClient — suporte fullscreen video + alerts
            webChromeClient = WebChromeClient()
            
            // Foco para D-pad (Android TV)
            isFocusable = true
            isFocusableInTouchMode = true
            requestFocus()
        }
        
        setContentView(webView)
        
        // Carregar site
        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(SITE_URL)
        }
    }
    
    // Persistir cookies
    override fun onPause() {
        super.onPause()
        CookieManager.getInstance().flush()
    }
    
    // Restaurar estado ao rotacionar
    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }
    
    // Back button — navegar histórico do WebView antes de sair
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }
    
    // D-pad support para Android TV
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        // Mapear D-pad para scroll do WebView
        when (event.keyCode) {
            KeyEvent.KEYCODE_DPAD_DOWN -> {
                if (event.action == KeyEvent.ACTION_DOWN) {
                    webView.pageScroll(View.FOCUS_DOWN)
                }
                return true
            }
            KeyEvent.KEYCODE_DPAD_UP -> {
                if (event.action == KeyEvent.ACTION_DOWN) {
                    webView.pageScroll(View.FOCUS_UP)
                }
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }
}
