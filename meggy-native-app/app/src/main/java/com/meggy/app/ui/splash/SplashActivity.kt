package com.meggy.app.ui.splash

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.meggy.app.databinding.ActivitySplashBinding
import com.meggy.app.ui.home.HomeActivity
import com.meggy.app.ui.login.LoginActivity
import com.meggy.app.util.SessionManager
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * SplashActivity — Meggy-branded launch screen.
 *
 * Shows the pink→purple gradient with the poodle emoji and app name for 1.5 seconds,
 * then routes the user to either HomeActivity (if a session cookie is still present)
 * or LoginActivity (otherwise).
 *
 * Note: we do NOT validate the cookie here — if it has expired the first API call
 * from HomeActivity will surface a 401 and the user will be bounced back to login.
 */
class SplashActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySplashBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySplashBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Hide system bars for a clean splash.
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        )

        lifecycleScope.launch {
            delay(1500)
            val session = SessionManager.get(this@SplashActivity)
            val target = if (session.isLoggedIn) {
                Intent(this@SplashActivity, HomeActivity::class.java)
            } else {
                Intent(this@SplashActivity, LoginActivity::class.java)
            }
            startActivity(target)
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
            finish()
        }
    }
}
