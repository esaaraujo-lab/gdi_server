package com.bibigyn.app.ui.login

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.inputmethod.EditorInfo
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.snackbar.Snackbar
import com.bibigyn.app.BiBiGynApp
import com.bibigyn.app.data.ApiService
import com.bibigyn.app.data.LoginResult
import com.bibigyn.app.databinding.ActivityLoginBinding
import com.bibigyn.app.ui.home.HomeActivity
import com.bibigyn.app.util.SessionManager
import kotlinx.coroutines.launch

class LoginActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLoginBinding
    private lateinit var api: ApiService

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        api = ApiService(application as BiBiGynApp)

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

        // ★ TV FIX: scroll automático para o campo focado quando o teclado aparece
        // Isso garante que o teclado on-screen da TV nunca cubra o campo ativo
        setupKeyboardScrollFix()

        // D-pad focus: start on username field.
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
                    // Post para garantir que o layout já foi atualizado
                    view.post {
                        val scrollY = calculateScrollYForView(view, scrollView.height)
                        scrollView.smoothScrollTo(0, scrollY)
                    }
                }
            }
        }
    }

    /**
     * Calcula a posição Y para rolar o ScrollView de modo que o view
     * fique no terço superior da tela (acima do teclado on-screen).
     */
    private fun calculateScrollYForView(view: View, screenHeight: Int): Int {
        val location = IntArray(2)
        view.getLocationInWindow(location)
        val viewTop = location[1]
        // Quer o view no terço superior (1/3 da tela) — deixa espaço para o teclado
        val targetY = screenHeight / 4
        val scrollOffset = viewTop - targetY
        return maxOf(0, scrollOffset)
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
