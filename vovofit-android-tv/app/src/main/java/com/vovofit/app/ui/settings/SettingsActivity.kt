package com.vovofit.app.ui.settings

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
import com.vovofit.app.BuildConfig
import com.vovofit.app.R
import com.vovofit.app.data.monogramFor
import com.vovofit.app.databinding.ActivitySettingsBinding
import com.vovofit.app.ui.home.HomeActivity
import com.vovofit.app.ui.login.LoginActivity
import com.vovofit.app.ui.mylist.MyListActivity
import com.vovofit.app.ui.search.SearchActivity
import com.vovofit.app.util.PlaylistManager
import com.vovofit.app.util.SessionManager
import com.vovofit.app.util.StudyReminder
import com.vovofit.app.util.TvUtils
import com.vovofit.app.util.UpdateChecker

/**
 * v1.0.4 — Ajustes (conceito Ajustes; Elton 23:45: funções REAIS).
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
                    R.id.nav_search -> { startActivity(Intent(this, SearchActivity::class.java)); overridePendingTransition(0, 0); true }
                    R.id.nav_mylist -> { startActivity(Intent(this, MyListActivity::class.java)); overridePendingTransition(0, 0); true }
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

        binding.aboutText.text = buildString {
            append("Vovó Fit — Android TV\n")
            append("Vovó Fit · v${BuildConfig.VERSION_NAME} (build ${BuildConfig.VERSION_CODE})\n\n")
            append("Plataforma de estudos integrada.\n")
            append("Atualizações automáticas via GitHub.\n\n")
            append("Tecnologias: Kotlin, Media3, Material 3.\n")
            append("© 2026 Vovó Fit · educa.eu.org")
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
