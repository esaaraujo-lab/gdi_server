package com.vovofit.app.ui.player

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.vovofit.app.R

/**
 * Frente R4C — áudio em 2º plano (tela apagada/bloqueada).
 *
 * Foreground service (tipo mediaPlayback) com notificação de media.
 * O serviço NÃO é dono do player: o ExoPlayer continua a pertencer
 * à PlayerActivity, que se regista aqui como PlaybackControls (em
 * onCreate; retira-se em onDestroy). O serviço só mantém o processo
 * em 1º plano (para o sistema não o matar com a tela apagada) e
 * expõe os controlos na notificação / tela de bloqueio.
 *
 * ARRANQUE (decisão central — ver patch-R4C.py): o serviço arranca
 * em initialisePlayer(), COM A ACTIVITY EM 1º PLANO. No Android 12+
 * um startForegroundService() a partir do onStop (app em 2º plano)
 * lança ForegroundServiceStartNotAllowedException — por isso ele
 * corre durante TODA a reprodução e não só quando a tela apaga.
 * Para em releasePlayer()/onDestroy() (a notificação some com ele).
 *
 * WAKE LOCK: não há WakeLock manual aqui — o ExoPlayer segura um
 * PARTIAL_WAKE_LOCK enquanto toca via setWakeMode(C.WAKE_MODE_LOCAL)
 * (ver initialisePlayer). O serviço em 1º plano isenta a app das
 * restrições de rede do Doze/app-standby com a tela apagada.
 *
 * SEM MediaSession (não há dependência media3-session no projeto):
 * a notificação é uma notificação normal com ações (MediaStyle) —
 * aparece na tela de bloqueio (VISIBILITY_PUBLIC) e na gaveta, mas
 * NÃO entra no carrossel de media do sistema. Ver NOTES.md.
 *
 * POST_NOTIFICATIONS (Android 13+): a notificação de um foreground
 * service NÃO exige a permissão em runtime para o serviço arrancar;
 * se o utilizador a negar, a notificação não aparece na gaveta (só
 * no Gestor de tarefas) mas o serviço e o áudio continuam.
 */
class BackgroundAudioService : Service() {

    /** Controlos do player, implementados pela PlayerActivity. */
    interface PlaybackControls {
        fun isPlaying(): Boolean
        fun togglePlayPause()
        fun seekByMs(deltaMs: Long)
        fun stopPlaybackFromNotification()
        fun currentTitle(): String
    }

    companion object {
        private const val CHANNEL_ID = "playback"
        private const val NOTIFICATION_ID = 1001

        const val ACTION_START = "com.vovofit.app.ui.player.ACTION_START"
        const val ACTION_TOGGLE = "com.vovofit.app.ui.player.ACTION_TOGGLE"
        const val ACTION_REWIND = "com.vovofit.app.ui.player.ACTION_REWIND"
        const val ACTION_FORWARD = "com.vovofit.app.ui.player.ACTION_FORWARD"
        const val ACTION_STOP = "com.vovofit.app.ui.player.ACTION_STOP"

        private const val SEEK_STEP_MS = 10_000L

        @Volatile
        private var controlsRef: java.lang.ref.WeakReference<PlaybackControls>? = null

        @Volatile
        private var running = false

        /** true enquanto o serviço corre (a notificação está viva). */
        fun isRunning(): Boolean = running

        /** A PlayerActivity regista-se em onCreate e retira-se em onDestroy. */
        fun registerControls(controls: PlaybackControls?) {
            controlsRef = if (controls == null) null
                else java.lang.ref.WeakReference(controls)
        }

        fun controls(): PlaybackControls? = controlsRef?.get()

        /**
         * Arranca o serviço em 1º plano. Chamar SEMPRE com a activity
         * em 1º plano (initialisePlayer) — ver o comentário da classe.
         */
        fun start(context: Context) {
            androidx.core.content.ContextCompat.startForegroundService(
                context,
                Intent(context, BackgroundAudioService::class.java).setAction(ACTION_START)
            )
        }

        /** Para o serviço (a notificação some com ele). Idempotente. */
        fun stop(context: Context) {
            context.stopService(Intent(context, BackgroundAudioService::class.java))
        }

        /**
         * Reconstrói a notificação com o estado atual (play/pausa e
         * título da aula). Sem efeito se o serviço não estiver a
         * correr — a PlayerActivity chama-o sem guardar estado.
         */
        fun refresh(context: Context) {
            if (!running) return
            val controls = controls() ?: return
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(NOTIFICATION_ID, buildNotification(context, controls))
        }

        private fun buildNotification(context: Context, controls: PlaybackControls): Notification {
            val playing = controls.isPlaying()
            val title = controls.currentTitle().ifBlank { context.getString(R.string.app_name) }
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            val openPlayer = PendingIntent.getActivity(
                context, 0,
                Intent(context, PlayerActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
                flags
            )
            fun actionIntent(action: String, requestCode: Int): PendingIntent =
                PendingIntent.getService(
                    context, requestCode,
                    Intent(context, BackgroundAudioService::class.java).setAction(action),
                    flags
                )
            val style = NotificationCompat.MediaStyle().setShowActionsInCompactView(0, 1, 2)
            return NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(if (playing) "A tocar" else "Em pausa")
                .setContentIntent(openPlayer)
                .setOngoing(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .addAction(android.R.drawable.ic_media_rew, "−10s", actionIntent(ACTION_REWIND, 1))
                .addAction(
                    if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
                    if (playing) "Pausa" else "Tocar",
                    actionIntent(ACTION_TOGGLE, 2)
                )
                .addAction(android.R.drawable.ic_media_ff, "+10s", actionIntent(ACTION_FORWARD, 3))
                .addAction(
                    android.R.drawable.ic_menu_close_clear_cancel, "Parar",
                    actionIntent(ACTION_STOP, 4)
                )
                .setStyle(style)
                .build()
        }
    }

    override fun onCreate() {
        super.onCreate()
        running = true
        createChannel()
    }

    override fun onDestroy() {
        running = false
        stopForeground(true)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val controls = controls()
        if (controls == null) {
            // O player já não existe (Activity destruída): não ficar órfão.
            stopSelf()
            return START_NOT_STICKY
        }
        when (intent?.action) {
            ACTION_TOGGLE -> controls.togglePlayPause()
            ACTION_REWIND -> controls.seekByMs(-SEEK_STEP_MS)
            ACTION_FORWARD -> controls.seekByMs(SEEK_STEP_MS)
            ACTION_STOP -> {
                controls.stopPlaybackFromNotification()
                return START_NOT_STICKY
            }
            // ACTION_START (ou sem ação): só (re)entra em 1º plano.
            else -> Unit
        }
        // A ação pode ter mudado o estado (play/pausa, seek, aula
        // seguinte): a notificação é reconstruída a seguir. O
        // onIsPlayingChanged da Activity também chama refresh().
        startForegroundCompat(buildNotification(this, controls))
        return START_NOT_STICKY
    }

    private fun startForegroundCompat(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID, notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            )
        } else {
            @Suppress("DEPRECATION")
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        nm.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID, "Reprodução", NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Controlos da aula em reprodução (o áudio continua com a tela apagada)"
                setShowBadge(false)
            }
        )
    }
}
