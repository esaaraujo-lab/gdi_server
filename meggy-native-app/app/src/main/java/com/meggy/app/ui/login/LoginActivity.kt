package com.meggy.app.ui.login

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.inputmethod.EditorInfo
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.snackbar.Snackbar
import com.meggy.app.MeggyApp
import com.meggy.app.data.ApiService
import com.meggy.app.data.LoginResult
import com.meggy.app.databinding.ActivityLoginBinding
import com.meggy.app.ui.home.HomeActivity
import com.meggy.app.util.SessionManager
import kotlinx.coroutines.launch

/**
 * LoginActivity — elegant Meggy-branded login form.
 *
 * Posts form-encoded username/password to /login. On success the session cookie
 * is stored in [SessionManager] and the user is routed to [HomeActivity].
 *
 * Form behaviour:
 *   - Enter on the password field triggers submit
 *   - Submit button is disabled while the request is in flight
 *   - Errors surface as a Snackbar (works on both touch and TV)
 */
class LoginActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLoginBinding
    private lateinit var api: ApiService

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        api = ApiService(application as MeggyApp)

        // If we already have a session, skip login entirely.
        if (SessionManager.get(this).isLoggedIn) {
            startActivity(Intent(this, HomeActivity::class.java))
            finish()
            return
        }

        binding.password.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                attemptLogin()
                true
            } else false
        }

        binding.btnLogin.setOnClickListener { attemptLogin() }

        // D-pad focus: start on username field.
        binding.username.requestFocus()
    }

    private fun attemptLogin() {
        val user = binding.username.text?.toString()?.trim().orEmpty()
        val pass = binding.password.text?.toString().orEmpty()

        if (user.isEmpty()) {
            binding.username.error = "Informe o usuário"
            binding.username.requestFocus()
            return
        }
        if (pass.isEmpty()) {
            binding.password.error = "Informe a senha"
            binding.password.requestFocus()
            return
        }

        setLoading(true)

        lifecycleScope.launch {
            val result = api.login(user, pass)
            setLoading(false)
            when (result) {
                is LoginResult.Success -> {
                    SessionManager.get(this@LoginActivity).apply {
                        sessionCookie = result.sessionCookie
                        username = result.username
                    }
                    val intent = Intent(this@LoginActivity, HomeActivity::class.java)
                    intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                    startActivity(intent)
                    overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
                    finish()
                }
                is LoginResult.Failure -> {
                    Snackbar.make(binding.root, result.reason, Snackbar.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun setLoading(loading: Boolean) {
        binding.btnLogin.isEnabled = !loading
        binding.loginProgress.visibility = if (loading) View.VISIBLE else View.GONE
        binding.username.isEnabled = !loading
        binding.password.isEnabled = !loading
    }
}
