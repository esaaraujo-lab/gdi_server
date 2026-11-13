package com.bibigyn.app.ui.login

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.bibigyn.app.data.ApiService
import com.bibigyn.app.databinding.ActivityLoginBinding
import com.bibigyn.app.ui.home.HomeActivity
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

        // ★ TV FIX: scroll automático para o campo focado quando o teclado aparece
        setupKeyboardScrollFix()

        binding.username.requestFocus()
    }

    /**
     * ★ TV FIX: Quando um campo recebe foco (e o teclado on-screen aparece),
     * rola o ScrollView para garantir que o campo fique visível acima do teclado.
     */
    private fun setupKeyboardScrollFix() {
        val scrollView = binding.loginScroll
        val fields = listOf(binding.username, binding.password, binding.btnLogin)

        for (field in fields) {
            field.setOnFocusChangeListener { view, hasFocus ->
                if (hasFocus) {
                    view.post {
                        val location = IntArray(2)
                        view.getLocationInWindow(location)
                        val viewTop = location[1]
                        val targetY = scrollView.height / 4
                        val scrollOffset = maxOf(0, viewTop - targetY)
                        scrollView.smoothScrollTo(0, scrollOffset)
                    }
                }
            }
        }
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
