package com.bibigyn.app.ui.splash

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.bibigyn.app.databinding.ActivitySplashBinding
import com.bibigyn.app.ui.home.HomeActivity
import com.bibigyn.app.ui.login.LoginActivity
import com.bibigyn.app.util.SessionManager
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * SplashActivity — Meggy-branded launch screen.
 *
 * v2.0.2: Uses FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_CLEAR_TASK when routing
 * to Home or Login. This clears the entire back stack so that:
 *   • After login, the user can NEVER press back to return to Login/Splash.
 *   • After re-opening the app, old activities from a previous session are
 *     cleared and the routing decision is made fresh.
 *
 * The activity itself is also declared with android:noHistory="true" in the
 * manifest as a belt-and-suspenders guarantee.
 *
 * Note: we do NOT validate the cookie here — if it has expired the first API
 * call from HomeActivity/BrowseActivity will detect the HTML login redirect
 * and bounce the user back to LoginActivity (see ApiService.listFolder).
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
            // ★ v2.0.2: Clear the entire back stack so the user can never
            // navigate back to Splash (or any stale activity from a previous
            // launch) after routing.
            target.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            startActivity(target)
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
            finish()
        }
    }
}
