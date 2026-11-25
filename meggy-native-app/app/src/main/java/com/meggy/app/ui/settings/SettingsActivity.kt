package com.meggy.app.ui.settings

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.meggy.app.BuildConfig
import com.meggy.app.R
import com.meggy.app.data.ApiService
import com.meggy.app.data.monogramFor
import com.meggy.app.databinding.ActivitySettingsBinding
import com.meggy.app.ui.home.HomeActivity
import com.meggy.app.ui.login.LoginActivity
import com.meggy.app.ui.search.SearchActivity
import com.meggy.app.util.FocusAnimator
import com.meggy.app.util.PlaylistManager
import com.meggy.app.util.SessionManager
import com.meggy.app.util.StudyReminder
import com.meggy.app.util.TvUtils
import com.meggy.app.util.UpdateChecker
import kotlinx.coroutines.launch

/**
 * v2.7.6 — Ajustes (conceito Ajustes; Elton 23:45: funções REAIS).
 *
 * Perfil: avatar com monograma + nome de usuário real + pill
 * "Conta ativa". NÃO há e-mail nem dado de assinatura no app
 * (SessionManager só tem o username; nenhum endpoint de assinatura)
 * — por isso NÃO existe pill "Assinante" (nunca inventar).
 *
 * Funções (tabela completa nas REDESIGN_NOTES):
 *  1. Notificações — lembrete diário de estudo 19:00 (AlarmManager
 *     inexact + BroadcastReceiver + canal; reagenda no boot). Pede a
 *     permissão POST_NOTIFICATIONS (Android 13+) ao ligar.
 *  2. Reprodução automática — lida pelo player
 *     (pauseAtEndOfMediaItems = !autoplayNext, verificado no main).
 *  3. Baixar só no Wi-Fi — o cache do player (VideoCache) só grava
 *     em Wi-Fi quando ligado; desligado, o cache grava em qualquer
 *     rede. Mínimo real — não há subsistema de downloads/offline.
 *  4. Legendas — toggle padrão do player (DefaultTrackSelector;
 *     desliga a renderização de texto). O CC do player é o controle
 *     por sessão/aula.
 *  5. Qualidade do vídeo — Auto/HD/SD via DefaultTrackSelector
 *     (setMaxVideoSize); só aplicado quando há >1 trilha de vídeo
 *     (as aulas hoje são MP4 progressivo de uma só versão).
 *  6. Velocidade padrão — salva e aplicada ao abrir o player.
 *  7. Sobre — versão dinâmica (BuildConfig).
 *  8. Sair da conta — logout COMPLETO (fullLogout, verificado).
 * Nenhuma opção existente foi removida — só reestilizada.
 * TV: sem bottom nav.
 */
class SettingsActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySettingsBinding
    private val speeds = floatArrayOf(0.75f, 1.0f, 1.25f, 1.5f, 1.75f, 2.0f)
    private val sleepOptions = intArrayOf(0, 15, 30, 45, 60)
    private val qualities = arrayOf("auto", "hd", "sd")
    private val qualityLabels = arrayOf("Automática", "HD", "SD")
    private var speedIdx = 1
    private var sleepIdx = 0
    private var qualityIdx = 0

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val sm = SessionManager.get(this)
        if (granted) {
            sm.notificationsEnabled = true
            StudyReminder.schedule(this)
            Toast.makeText(this, "🔔 Lembrete diário de estudo ativado (19:00)", Toast.LENGTH_SHORT).show()
        } else {
            sm.notificationsEnabled = false
            binding.switchNotifications.isChecked = false
            Toast.makeText(this, "Permissão de notificação negada — lembrete desligado", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySettingsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.toolbar.setNavigationOnClickListener { finish() }
        if (TvUtils.isTv(this)) {
            binding.bottomNav.visibility = View.GONE
        } else {
            binding.bottomNav.selectedItemId = R.id.nav_settings
            binding.bottomNav.setOnItemSelectedListener { item ->
                when (item.itemId) {
                    R.id.nav_settings -> true
                    R.id.nav_home -> { startActivity(Intent(this, HomeActivity::class.java)); overridePendingTransition(0, 0); true }
                    R.id.nav_drives -> { val i = Intent(this, HomeActivity::class.java); i.putExtra(HomeActivity.EXTRA_SCROLL_TO_DRIVES, true); startActivity(i); overridePendingTransition(0, 0); true }
                    R.id.nav_simulados -> { HomeActivity.openSimulados(this); overridePendingTransition(0, 0); true }
                    R.id.nav_meggy -> { startActivity(Intent(this, SearchActivity::class.java)); overridePendingTransition(0, 0); true }
                    else -> false
                }
            }
        }

        val sm = SessionManager.get(this)

        // Perfil — só o username existe de verdade.
        val username = sm.username ?: "Aluno"
        binding.profileAvatar.text = monogramFor(username)
        binding.profileName.text = username
        binding.profileSub.text = "Conta ativa"
        binding.profilePill.text = "Conta ativa"

        // Velocidade / sono / qualidade
        val currentSpeed = sm.defaultSpeed
        speedIdx = speeds.indexOfFirst { it == currentSpeed }.coerceAtLeast(0)
        val currentSleep = sm.defaultSleepTimerMin
        sleepIdx = sleepOptions.indexOfFirst { it == currentSleep }.coerceAtLeast(0)
        qualityIdx = qualities.indexOf(sm.videoQuality).coerceAtLeast(0)
        updateSpeedLabel()
        updateSleepLabel()
        updateQualityLabel()

        binding.btnSpeedDown.setOnClickListener {
            speedIdx = (speedIdx - 1 + speeds.size) % speeds.size
            sm.defaultSpeed = speeds[speedIdx]
            updateSpeedLabel()
        }
        binding.btnSpeedUp.setOnClickListener {
            speedIdx = (speedIdx + 1) % speeds.size
            sm.defaultSpeed = speeds[speedIdx]
            updateSpeedLabel()
        }
        binding.btnSleepDown.setOnClickListener {
            sleepIdx = (sleepIdx - 1 + sleepOptions.size) % sleepOptions.size
            sm.defaultSleepTimerMin = sleepOptions[sleepIdx]
            updateSleepLabel()
        }
        binding.btnSleepUp.setOnClickListener {
            sleepIdx = (sleepIdx + 1) % sleepOptions.size
            sm.defaultSleepTimerMin = sleepOptions[sleepIdx]
            updateSleepLabel()
        }
        binding.btnQualityDown.setOnClickListener {
            qualityIdx = (qualityIdx - 1 + qualities.size) % qualities.size
            sm.videoQuality = qualities[qualityIdx]
            updateQualityLabel()
        }
        binding.btnQualityUp.setOnClickListener {
            qualityIdx = (qualityIdx + 1) % qualities.size
            sm.videoQuality = qualities[qualityIdx]
            updateQualityLabel()
        }

        // Toggles
        binding.switchAutoplay.isChecked = sm.autoplayNext
        binding.switchAutoplay.setOnCheckedChangeListener { _, isChecked ->
            sm.autoplayNext = isChecked
        }
        binding.switchWifiOnly.isChecked = sm.wifiOnlyDownloads
        binding.switchWifiOnly.setOnCheckedChangeListener { _, isChecked ->
            sm.wifiOnlyDownloads = isChecked
            Toast.makeText(this,
                if (isChecked) "Cache de vídeo só em Wi-Fi"
                else "Cache de vídeo em qualquer rede",
                Toast.LENGTH_SHORT).show()
        }
        // 2.7.48 — menu lateral da TV (só na TV: no celular a linha
        // esconde-se — a preferência não faz sentido lá).
        if (TvUtils.isTv(this)) {
            binding.switchTvSideMenu.isChecked = sm.tvSideMenuEnabled
            binding.switchTvSideMenu.setOnCheckedChangeListener { _, isChecked ->
                sm.tvSideMenuEnabled = isChecked
                Toast.makeText(this,
                    if (isChecked) "Menu lateral da TV ativado"
                    else "Menu lateral da TV desativado",
                    Toast.LENGTH_SHORT).show()
            }
        } else {
            binding.tvSideMenuRow.visibility = View.GONE
        }
        binding.switchSubtitles.isChecked = sm.subtitlesEnabled
        binding.switchSubtitles.setOnCheckedChangeListener { _, isChecked ->
            sm.subtitlesEnabled = isChecked
        }

        binding.switchNotifications.isChecked = sm.notificationsEnabled
        binding.switchNotifications.setOnCheckedChangeListener { _, isChecked ->
            if (isChecked) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                    ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
                    notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                } else {
                    sm.notificationsEnabled = true
                    StudyReminder.schedule(this)
                    Toast.makeText(this, "🔔 Lembrete diário de estudo ativado (19:00)", Toast.LENGTH_SHORT).show()
                }
            } else {
                sm.notificationsEnabled = false
                StudyReminder.cancel(this)
                Toast.makeText(this, "Lembrete de estudo desligado", Toast.LENGTH_SHORT).show()
            }
        }

        binding.btnCheckUpdate.setOnClickListener {
            Toast.makeText(this, "🔍 Verificando atualizações...", Toast.LENGTH_SHORT).show()
            UpdateChecker.checkForUpdate(this, BuildConfig.VERSION_NAME, showFeedback = true)
        }

        binding.btnLogout.setOnClickListener { logout() }

        // Ronda 10 Frente B — entrada "Gerenciar drives", SÓ para admin.
        // O valor em cache (SessionManager, do username atual) decide
        // de imediato; checkAdmin() revalida em 2.º plano (GET /api/me
        // ou fallback provisório) e corrige a visibilidade.
        binding.rowAdminDrives.setOnClickListener {
            startActivity(Intent(this, AdminDrivesActivity::class.java))
        }
        refreshAdminRow()

        // Frente G (TV) — interruptores, botões +/−, "Verificar
        // atualizações" e "Sair" são focáveis mas sem feedback
        // de foco (fundos estáticos): o D-pad chegava sem se ver
        // onde estava (mesmo padrão da Frente A no detalhe).
        if (TvUtils.isTv(this)) {
            listOf(binding.switchNotifications, binding.switchAutoplay,
                binding.switchWifiOnly, binding.switchSubtitles,
                binding.switchTvSideMenu,
                binding.btnSpeedDown, binding.btnSpeedUp,
                binding.btnSleepDown, binding.btnSleepUp,
                binding.btnQualityDown, binding.btnQualityUp,
                binding.btnCheckUpdate, binding.btnLogout,
                binding.rowAdminDrives)
                .forEach { FocusAnimator.attach(it, true) }
        }

        binding.aboutText.text = buildString {
            append("APK Completo da Meggy — celular e TV\n")
            append("Meggy · v${BuildConfig.VERSION_NAME} (build ${BuildConfig.VERSION_CODE})\n\n")
            append("Plataforma de estudos integrada.\n")
            append("Atualizações automáticas via GitHub.\n\n")
            append("Tecnologias: Kotlin, Media3, Material 3.\n")
            append("© 2026 Meggy · educa.eu.org")
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        binding.bottomNav.selectedItemId = R.id.nav_settings
    }

    private fun updateSpeedLabel() {
        binding.speedValue.text = "${speeds[speedIdx]}x"
    }

    private fun updateSleepLabel() {
        val min = sleepOptions[sleepIdx]
        binding.sleepValue.text = if (min == 0) "Off" else "${min}min"
    }

    private fun updateQualityLabel() {
        binding.qualityValue.text = qualityLabels[qualityIdx]
    }

    /**
     * Ronda 10 Frente B — mostra a linha "Gerenciar drives (admin)" só
     * quando o usuário é admin. Aplica o cache de imediato (sem
     * flicker) e revalida em 2.º plano; nunca mostra a linha a
     * não-admins nem rebenta se a rede falhar.
     */
    private fun refreshAdminRow() {
        val sm = SessionManager.get(this)
        val cached = sm.cachedIsAdmin(sm.username)
        binding.rowAdminDrives.visibility =
            if (cached == true) View.VISIBLE else View.GONE
        lifecycleScope.launch {
            val admin = try {
                ApiService(this@SettingsActivity).checkAdmin()
            } catch (_: Exception) {
                cached ?: false
            }
            binding.rowAdminDrives.visibility =
                if (admin) View.VISIBLE else View.GONE
        }
    }

    private fun logout() {
        // v2.7.5: logout COMPLETO — fullLogout apaga usuário + senha.
        SessionManager.get(this).fullLogout()
        PlaylistManager.clear()
        val intent = Intent(this, LoginActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }
}
