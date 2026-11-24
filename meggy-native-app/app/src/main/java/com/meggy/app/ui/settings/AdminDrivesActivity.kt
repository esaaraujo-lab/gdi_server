package com.meggy.app.ui.settings

import android.app.AlertDialog
import android.os.Bundle
import android.view.View
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.meggy.app.R
import com.meggy.app.data.AdminDrive
import com.meggy.app.data.AdminDriveResult
import com.meggy.app.data.ApiService
import com.meggy.app.databinding.ActivityAdminDrivesBinding
import com.meggy.app.util.FocusAnimator
import com.meggy.app.util.TvUtils
import kotlinx.coroutines.launch

/**
 * Ronda 10 Frente B — "Gerenciar drives" (só admin; abre a partir de
 * Ajustes quando checkAdmin() diz admin).
 *
 * O admin coloca o ID de uma pasta do Drive e escolhe para que APKs
 * ela vai (Meggy / BiBi / Vovó); pode incluir link de capa e de
 * sub-capa (vazios → capa do admin + sub-capa genérica, tratadas pela
 * Frente C) e capas por sub-pasta (linhas caminho → link). Os drives
 * do admin podem ser removidos (confirmação; a pasta no Drive NÃO é
 * apagada — só o registro).
 *
 * Servidor (Frente A da ronda 13, DEPLOYADO no sandbox): tabela D1
 * admin_drives + GET /api/admin-drives, POST
 * /api/admin/admin-drives/add|update|delete e GET /api/me. Sem endpoint, o
 * a tela mostra "função indisponível até o servidor a ativar" (nunca
 * uma lista vazia enganadora, nunca crash). O admin vê TODOS os
 * drives que criou, em qualquer APK (o filtro por targetApps é da
 * Frente C, na Home).
 */
class AdminDrivesActivity : AppCompatActivity() {

    private lateinit var binding: ActivityAdminDrivesBinding
    private lateinit var api: ApiService

    /** null = ainda sem resposta do servidor; false = rota ausente/falha. */
    private var serverAvailable: Boolean? = null

    /** Ronda 13 Frente C — id do drive em edicao (null = a adicionar). */
    private var editingId: Long? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityAdminDrivesBinding.inflate(layoutInflater)
        setContentView(binding.root)
        api = ApiService(this)

        binding.toolbar.setNavigationOnClickListener { finish() }

        // Pré-marcar o APK atual como destino (o admin pode mudar).
        when (AdminDrive.targetForPackage(packageName)) {
            AdminDrive.TARGET_MEGGY -> binding.checkMeggy.isChecked = true
            AdminDrive.TARGET_BIBI -> binding.checkBibi.isChecked = true
            AdminDrive.TARGET_VOVO -> binding.checkVovo.isChecked = true
        }

        binding.btnAddSubfolderCover.setOnClickListener {
            addSubfolderCoverRow(null, null)
        }
        binding.btnSaveDrive.setOnClickListener { saveDrive() }

        if (TvUtils.isTv(this)) {
            listOf(binding.checkMeggy, binding.checkBibi, binding.checkVovo,
                binding.btnAddSubfolderCover, binding.btnSaveDrive)
                .forEach { FocusAnimator.attach(it, true) }
        }

        // Defesa em profundidade: a entrada em Ajustes já só aparece
        // para admin, mas um arranque direto sem papel fecha a tela.
        lifecycleScope.launch {
            val admin = try { api.checkAdmin() } catch (_: Exception) { false }
            if (!admin) {
                Toast.makeText(this@AdminDrivesActivity,
                    R.string.admin_drives_not_admin, Toast.LENGTH_LONG).show()
                finish()
                return@launch
            }
            loadDrives()
        }
    }

    /** (Re)carrega a lista de drives do admin a partir do servidor. */
    private fun loadDrives() {
        binding.adminStatus.text = getString(R.string.admin_drives_loading)
        binding.adminStatus.visibility = View.VISIBLE
        binding.drivesList.removeAllViews()
        binding.drivesEmpty.visibility = View.GONE
        lifecycleScope.launch {
            val drives = try { api.getAdminDrives() } catch (_: Exception) { null }
            serverAvailable = drives != null
            binding.btnSaveDrive.isEnabled = drives != null
            if (drives == null) {
                // Rota ausente (404) ou sem rede: função indisponível,
                // sem crash e sem lista vazia enganadora.
                binding.adminStatus.text =
                    getString(R.string.admin_drives_unavailable)
                return@launch
            }
            binding.adminStatus.visibility = View.GONE
            if (drives.isEmpty()) {
                binding.drivesEmpty.visibility = View.VISIBLE
            } else {
                for (drive in drives) addDriveRow(drive)
            }
        }
    }

    private fun addDriveRow(drive: AdminDrive) {
        val row = layoutInflater.inflate(
            R.layout.item_admin_drive, binding.drivesList, false)
        row.findViewById<TextView>(R.id.driveName).text = drive.name
        row.findViewById<TextView>(R.id.driveMeta).text =
            "ID: ${drive.driveId} · ${drive.targetLabels()}"
        val bits = mutableListOf<String>()
        if (drive.coverUrl != null) bits.add("capa") else bits.add("sem capa")
        if (drive.subCoverUrl != null) bits.add("sub-capa")
        else bits.add("sub-capa genérica")
        if (drive.subfolderCovers.isNotEmpty()) {
            bits.add("${drive.subfolderCovers.size} capa(s) de sub-pasta(s)")
        }
        row.findViewById<TextView>(R.id.driveCovers).text =
            bits.joinToString(" · ")
        row.findViewById<View>(R.id.btnEditDrive).setOnClickListener {
            startEdit(drive)
        }
        row.findViewById<View>(R.id.btnRemoveDrive).setOnClickListener {
            confirmRemove(drive)
        }
        binding.drivesList.addView(row)
    }

    /**
     * Ronda 13 Frente C — edicao (POST /api/admin/admin-drives/
     * update): carrega o drive no formulario e troca o Salvar p/
     * atualizar. O ID da pasta NAO muda (o update identifica pela
     * chave `id`); o campo fica desligado p/ nao sugerir o contrario.
     * Os campos vazios de capa/sub-capa no Salvar limpam-nas no
     * servidor (null JSON — ver ApiService.updateAdminDrive).
     */
    private fun startEdit(drive: AdminDrive) {
        editingId = drive.id
        binding.inputDriveId.setText(drive.driveId)
        binding.inputDriveId.isEnabled = false
        binding.inputDriveName.setText(drive.name)
        binding.inputCoverUrl.setText(drive.coverUrl ?: "")
        binding.inputSubCoverUrl.setText(drive.subCoverUrl ?: "")
        binding.checkMeggy.isChecked = AdminDrive.TARGET_MEGGY in drive.targetApps
        binding.checkBibi.isChecked = AdminDrive.TARGET_BIBI in drive.targetApps
        binding.checkVovo.isChecked = AdminDrive.TARGET_VOVO in drive.targetApps
        binding.subfolderCoversContainer.removeAllViews()
        for ((path, url) in drive.subfolderCovers) addSubfolderCoverRow(path, url)
        binding.btnSaveDrive.setText(R.string.admin_drives_save_edit)
        binding.inputDriveName.requestFocus()
    }

    /** Volta o formulario ao modo "adicionar" (apos salvar). */
    private fun resetEditMode() {
        editingId = null
        binding.inputDriveId.isEnabled = true
        binding.btnSaveDrive.setText(R.string.admin_drives_save)
    }

    private fun confirmRemove(drive: AdminDrive) {
        AlertDialog.Builder(this)
            .setTitle(R.string.admin_drives_remove_title)
            .setMessage(getString(R.string.admin_drives_remove_confirm, drive.name))
            .setPositiveButton(R.string.admin_drives_remove) { _, _ ->
                removeDrive(drive)
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun removeDrive(drive: AdminDrive) {
        lifecycleScope.launch {
            val result = try {
                api.deleteAdminDrive(drive.id)
            } catch (_: Exception) {
                AdminDriveResult.Error(
                    getString(R.string.admin_drives_error_generic))
            }
            when (result) {
                AdminDriveResult.Success -> {
                    Toast.makeText(this@AdminDrivesActivity,
                        R.string.admin_drives_removed, Toast.LENGTH_SHORT).show()
                    loadDrives()
                }
                AdminDriveResult.Unavailable ->
                    Toast.makeText(this@AdminDrivesActivity,
                        R.string.admin_drives_unavailable, Toast.LENGTH_LONG).show()
                is AdminDriveResult.Error ->
                    Toast.makeText(this@AdminDrivesActivity,
                        result.message, Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun addSubfolderCoverRow(path: String?, url: String?) {
        val row = layoutInflater.inflate(
            R.layout.item_subfolder_cover,
            binding.subfolderCoversContainer, false)
        row.findViewById<EditText>(R.id.inputSubPath).setText(path ?: "")
        row.findViewById<EditText>(R.id.inputSubUrl).setText(url ?: "")
        row.findViewById<View>(R.id.btnRemoveSubCover).setOnClickListener {
            binding.subfolderCoversContainer.removeView(row)
        }
        binding.subfolderCoversContainer.addView(row)
    }

    private fun saveDrive() {
        val driveId = binding.inputDriveId.text.toString().trim()
        val name = binding.inputDriveName.text.toString().trim()
        val coverUrl = binding.inputCoverUrl.text.toString().trim()
        val subCoverUrl = binding.inputSubCoverUrl.text.toString().trim()
        if (driveId.isEmpty()) {
            binding.inputDriveId.error =
                getString(R.string.admin_drives_error_drive_id)
            binding.inputDriveId.requestFocus()
            return
        }
        if (name.isEmpty()) {
            binding.inputDriveName.error =
                getString(R.string.admin_drives_error_name)
            binding.inputDriveName.requestFocus()
            return
        }
        val targets = mutableListOf<String>()
        if (binding.checkMeggy.isChecked) targets.add(AdminDrive.TARGET_MEGGY)
        if (binding.checkBibi.isChecked) targets.add(AdminDrive.TARGET_BIBI)
        if (binding.checkVovo.isChecked) targets.add(AdminDrive.TARGET_VOVO)
        if (targets.isEmpty()) {
            Toast.makeText(this, R.string.admin_drives_error_targets,
                Toast.LENGTH_SHORT).show()
            return
        }
        if (coverUrl.isNotEmpty() && !isHttpUrl(coverUrl)) {
            binding.inputCoverUrl.error =
                getString(R.string.admin_drives_error_url)
            binding.inputCoverUrl.requestFocus()
            return
        }
        if (subCoverUrl.isNotEmpty() && !isHttpUrl(subCoverUrl)) {
            binding.inputSubCoverUrl.error =
                getString(R.string.admin_drives_error_url)
            binding.inputSubCoverUrl.requestFocus()
            return
        }
        val subfolderCovers = LinkedHashMap<String, String>()
        for (i in 0 until binding.subfolderCoversContainer.childCount) {
            val row = binding.subfolderCoversContainer.getChildAt(i)
            val path = row.findViewById<EditText>(R.id.inputSubPath)
                .text.toString().trim()
            val url = row.findViewById<EditText>(R.id.inputSubUrl)
                .text.toString().trim()
            if (path.isEmpty() && url.isEmpty()) continue
            if (path.isEmpty() || url.isEmpty()) {
                Toast.makeText(this, R.string.admin_drives_error_subfolder_pair,
                    Toast.LENGTH_SHORT).show()
                return
            }
            if (!isHttpUrl(url)) {
                Toast.makeText(this, R.string.admin_drives_error_url,
                    Toast.LENGTH_SHORT).show()
                return
            }
            subfolderCovers[path] = url
        }
        binding.btnSaveDrive.isEnabled = false
        val editId = editingId
        lifecycleScope.launch {
            val result = try {
                if (editId != null) {
                    api.updateAdminDrive(
                        editId, name, targets,
                        coverUrl.ifEmpty { null }, subCoverUrl.ifEmpty { null },
                        subfolderCovers)
                } else {
                    api.addAdminDrive(
                        driveId, name, targets,
                        coverUrl.ifEmpty { null }, subCoverUrl.ifEmpty { null },
                        subfolderCovers)
                }
            } catch (_: Exception) {
                AdminDriveResult.Error(
                    getString(R.string.admin_drives_error_generic))
            }
            binding.btnSaveDrive.isEnabled = serverAvailable != false
            when (result) {
                AdminDriveResult.Success -> {
                    Toast.makeText(this@AdminDrivesActivity,
                        if (editId != null) R.string.admin_drives_updated
                        else R.string.admin_drives_saved, Toast.LENGTH_SHORT).show()
                    clearForm()
                    loadDrives()
                }
                AdminDriveResult.Unavailable ->
                    Toast.makeText(this@AdminDrivesActivity,
                        R.string.admin_drives_unavailable, Toast.LENGTH_LONG).show()
                is AdminDriveResult.Error ->
                    Toast.makeText(this@AdminDrivesActivity,
                        result.message, Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun clearForm() {
        resetEditMode()
        binding.inputDriveId.text?.clear()
        binding.inputDriveName.text?.clear()
        binding.inputCoverUrl.text?.clear()
        binding.inputSubCoverUrl.text?.clear()
        binding.subfolderCoversContainer.removeAllViews()
    }

    private fun isHttpUrl(s: String): Boolean =
        s.startsWith("http://") || s.startsWith("https://")
}
