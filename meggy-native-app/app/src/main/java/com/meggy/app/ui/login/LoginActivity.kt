package com.meggy.app.ui.login

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.meggy.app.data.ApiService
import com.meggy.app.databinding.ActivityLoginBinding
import com.meggy.app.ui.home.HomeActivity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class LoginActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLoginBinding
    private lateinit var api: ApiService

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        api = ApiService(this)

        binding.btnLogin.setOnClickListener {
            attemptLogin()
        }

        binding.password.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == android.view.inputmethod.EditorInfo.IME_ACTION_DONE) {
                attemptLogin()
                true
            } else false
        }

        binding.username.requestFocus()
    }

    private fun attemptLogin() {
        val user = binding.username.text?.toString()?.trim().orEmpty()
        val pass = binding.password.text?.toString().orEmpty()

        if (user.isEmpty()) {
            binding.usernameLayout.error = "Informe o usuário"
            return
        }
        if (pass.isEmpty()) {
            binding.passwordLayout.error = "Informe a senha"
            return
        }

        setLoading(true)
        lifecycleScope.launch {
            val success = withContext(Dispatchers.IO) { api.login(user, pass) }
            setLoading(false)
            if (success) {
                // ★ v2.0.2: Clear the entire back stack when going to Home.
                // Combined with android:noHistory="true" on LoginActivity in
                // the manifest, this guarantees the user can NEVER press back
                // to return to the login screen after a successful login.
                val intent = Intent(this@LoginActivity, HomeActivity::class.java)
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                startActivity(intent)
                overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
                finish()
            } else {
                binding.passwordLayout.error = "Usuário ou senha inválidos"
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
