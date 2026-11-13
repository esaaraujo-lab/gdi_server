package com.vovofit.app.ui.login

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.inputmethod.InputMethodManager
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.vovofit.app.data.ApiService
import com.vovofit.app.databinding.ActivityLoginBinding
import com.vovofit.app.ui.home.HomeActivity
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

        // ★ v2.1.2 TV KEYBOARD FIX: requestFocus() alone gives D-pad focus but
        // does NOT trigger the IME on Android TV. We explicitly call
        // showSoftInput() with a small postDelayed (200ms) so the window is
        // ready. Without this, on some TVs the on-screen keyboard never
        // appears and the user cannot type credentials.
        binding.username.requestFocus()
        binding.username.postDelayed({
            val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
            imm.showSoftInput(binding.username, InputMethodManager.SHOW_IMPLICIT)
        }, 200)

        // ★ v2.1.2 TV KEYBOARD FIX: D-pad center button = onClick. On a TV,
        // pressing the center D-pad button on a focused EditText should also
        // force-show the IME (some OEM launchers swallow it).
        binding.username.setOnClickListener {
            val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
            imm.showSoftInput(binding.username, InputMethodManager.SHOW_IMPLICIT)
        }
        binding.password.setOnClickListener {
            val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
            imm.showSoftInput(binding.password, InputMethodManager.SHOW_IMPLICIT)
        }
    }

    /**
     * ★ TV FIX: Quando um campo recebe foco (e o teclado on-screen aparece),
     * rola o ScrollView para garantir que o campo fique visível acima do teclado.
     *
     * ★ v2.1.2 TV KEYBOARD FIX: also explicitly showSoftInput() when a field
     * gains focus — on some Android TVs D-pad navigation focuses the EditText
     * but does NOT auto-open the IME without this explicit call.
     */
    private fun setupKeyboardScrollFix() {
        val scrollView = binding.loginScroll
        val fields = listOf(binding.username, binding.password, binding.btnLogin)

        for (field in fields) {
            field.setOnFocusChangeListener { view, hasFocus ->
                if (hasFocus) {
                    // ★ v2.1.2: force IME open when the field gains focus on TV
                    val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
                    imm.showSoftInput(view, InputMethodManager.SHOW_IMPLICIT)

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
                // ★ v2.1.2 LOGIN PERSISTENCE: persist the password so the app
                // can auto re-login later when the server cookie expires.
                // SessionManager.login() already saves username + session
                // cookie, so we only need to save the password here.
                com.vovofit.app.util.SessionManager.get(this@LoginActivity).password = pass

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
