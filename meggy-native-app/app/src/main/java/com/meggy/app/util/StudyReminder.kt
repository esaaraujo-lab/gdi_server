package com.meggy.app.util

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.meggy.app.R
import com.meggy.app.ui.home.HomeActivity
import java.util.Calendar

/**
 * v2.7.6 — Lembrete diário de estudo (Ajustes → Notificações).
 *
 * REAL, não um toggle decorativo: quando o usuário liga "Notificações",
 * agenda um alarme diário inexato às 19:00 que dispara uma notificação
 * local ("Hora de estudar 📚 — continue de onde parou"). Desligar
 * cancela o alarme. O alarme é reagendado após reboot
 * (StudyReminderBootReceiver, registrado no manifest).
 *
 * Sem FCM, sem servidor, sem WorkManager: AlarmManager + BroadcastReceiver
 * bastam para um lembrete diário e não adicionam dependência.
 *
 * Na TV o alarme também é agendado, mas o sistema de TV pode não
 * exibir a notificação da mesma forma — documentado em REDESIGN_NOTES.md.
 */
object StudyReminder {
    const val CHANNEL_ID = "meggy_study_reminder"
    const val NOTIFICATION_ID = 1001
    private const val REQUEST_CODE = 9101
    private const val HOUR = 19
    private const val MINUTE = 0

    fun schedule(context: Context) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
            ?: return
        val pending = pendingIntent(context)
        val trigger = nextTriggerMillis()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setInexactRepeating(
                AlarmManager.RTC_WAKEUP, trigger,
                AlarmManager.INTERVAL_DAY, pending
            )
        } else {
            @Suppress("DEPRECATION")
            alarmManager.setInexactRepeating(
                AlarmManager.RTC_WAKEUP, trigger,
                AlarmManager.INTERVAL_DAY, pending
            )
        }
    }

    fun cancel(context: Context) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
            ?: return
        alarmManager.cancel(pendingIntent(context))
    }

    fun isScheduled(context: Context): Boolean {
        val flags = PendingIntent.FLAG_NO_CREATE or
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
        val pi = PendingIntent.getBroadcast(
            context, REQUEST_CODE,
            Intent(context, StudyReminderReceiver::class.java), flags
        )
        return pi != null
    }

    private fun nextTriggerMillis(): Long {
        val cal = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, HOUR)
            set(Calendar.MINUTE, MINUTE)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            if (timeInMillis <= System.currentTimeMillis()) {
                add(Calendar.DAY_OF_YEAR, 1)
            }
        }
        return cal.timeInMillis
    }

    private fun pendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, StudyReminderReceiver::class.java)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
        return PendingIntent.getBroadcast(context, REQUEST_CODE, intent, flags)
    }

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            ?: return
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Lembrete de estudo",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply { description = "Lembrete diário para continuar os estudos" }
        nm.createNotificationChannel(channel)
    }

    fun showNotification(context: Context) {
        ensureChannel(context)
        val openIntent = Intent(context, HomeActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
        val pi = PendingIntent.getActivity(context, 0, openIntent, flags)
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Hora de estudar 📚")
            .setContentText("Continue de onde parou — sua próxima aula está esperando.")
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        nm?.notify(NOTIFICATION_ID, notification)
    }
}

/** Disparado pelo AlarmManager às 19:00 quando o lembrete está ligado. */
class StudyReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (!SessionManager.get(context).notificationsEnabled) return
        StudyReminder.showNotification(context)
    }
}

/** Reagenda o lembrete após o reboot, se o usuário o deixou ligado. */
class StudyReminderBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return
        if (!SessionManager.get(context).notificationsEnabled) return
        StudyReminder.schedule(context)
    }
}
