package com.meggy.app.ui.meggy

import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import com.meggy.app.R
import com.meggy.app.util.MarkdownRenderer

/**
 * 2.7.58 — Bolhas do chat da Meggy: aluno à direita (rosa), Meggy à
 * esquerda com a carinha real; markdown SÓ nas respostas dela
 * (MarkdownRenderer existente). Mensagens de erro são clicáveis
 * (retry) — o clique é delegado à activity.
 */
class ChatAdapter(
    private val onErrorClick: () -> Unit
) : RecyclerView.Adapter<ChatAdapter.VH>() {

    data class Msg(val role: String, val text: String, val isError: Boolean = false)

    val messages = ArrayList<Msg>()

    fun add(msg: Msg): Int {
        messages.add(msg)
        notifyItemInserted(messages.lastIndex)
        return messages.lastIndex
    }

    fun removeAt(index: Int) {
        if (index in messages.indices) {
            messages.removeAt(index)
            notifyItemRemoved(index)
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_chat_message, parent, false)
        return VH(view)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val msg = messages[position]
        val ctx = holder.itemView.context
        val row = holder.itemView as LinearLayout
        val isUser = msg.role == "user"
        holder.avatar.visibility = if (isUser) View.GONE else View.VISIBLE
        row.gravity = if (isUser) Gravity.END else Gravity.START
        holder.bubble.background = ContextCompat.getDrawable(
            ctx,
            if (isUser) R.drawable.chat_bubble_user else R.drawable.chat_bubble_assistant
        )
        holder.bubble.setTextColor(
            ContextCompat.getColor(
                ctx,
                if (isUser) R.color.md_on_primary else R.color.md_on_surface
            )
        )
        if (isUser) {
            holder.bubble.text = msg.text
        } else {
            MarkdownRenderer.renderMarkdown(holder.bubble, msg.text)
            // renderMarkdown pode repintar a cor; repõe a cor da bolha.
            holder.bubble.setTextColor(ContextCompat.getColor(ctx, R.color.md_on_surface))
        }
        holder.itemView.setOnClickListener {
            if (msg.isError) onErrorClick()
        }
    }

    override fun getItemCount(): Int = messages.size

    class VH(view: View) : RecyclerView.ViewHolder(view) {
        val avatar: ImageView = view.findViewById(R.id.chatAvatar)
        val bubble: TextView = view.findViewById(R.id.chatBubble)
    }
}
