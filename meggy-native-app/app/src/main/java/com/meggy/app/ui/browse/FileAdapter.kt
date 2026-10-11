package com.meggy.app.ui.browse

import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.AnimationUtils
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import coil.ImageLoader
import coil.memory.MemoryCache
import coil.request.ImageRequest
import coil.size.Size
import com.meggy.app.R
import com.meggy.app.data.FileItem
import com.meggy.app.data.colorFromString
import com.meggy.app.databinding.ItemRailCardBinding
import com.meggy.app.util.SessionManager

/**
 * Netflix/Disney+ inspired tile grid adapter (v2.1.0).
 *
 * v2.1.0 changes:
 *  • Real thumbnails — loads Google Drive thumbnailLink via Coil when
 *    available. Falls back to gradient + emoji when not.
 *  • Real progress bar — reads position/duration from SessionManager
 *    and shows the actual % watched (was hardcoded 35%).
 *  • Thumbnail ImageView added to item_rail_card.xml.
 */
class FileAdapter(
    private val onFolder: (FileItem) -> Unit,
    private val onFile: (FileItem) -> Unit
) : ListAdapter<FileItem, FileAdapter.VH>(DIFF) {

    private var resumedNames: Set<String> = emptySet()
    private var watchedNames: Set<String> = emptySet()
    private var currentFolderPath: String = "/"

    /** Feeds the two badge sets for the current folder and refreshes every row. */
    fun setResumeAndWatched(resumed: Set<String>, watched: Set<String>) {
        resumedNames = resumed
        watchedNames = watched
        if (itemCount > 0) notifyItemRangeChanged(0, itemCount)
    }

    /** v2.1.0: Sets the current folder path so we can look up real progress %. */
    fun setFolderPath(path: String) {
        currentFolderPath = path
    }

    inner class VH(val binding: ItemRailCardBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.isFocusable = true
            binding.root.isFocusableInTouchMode = true
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return@setOnClickListener
                val item = getItem(pos)
                if (item.isFolder) onFolder(item) else onFile(item)
            }
            binding.root.setOnFocusChangeListener { _, hasFocus ->
                animateFocus(hasFocus)
            }
        }

        fun animateFocus(hasFocus: Boolean) {
            val scale = if (hasFocus) 1.06f else 1f
            binding.cardRoot.animate().scaleX(scale).scaleY(scale)
                .setDuration(180)
                .withEndAction(null)
                .start()
            binding.cardRoot.cardElevation = if (hasFocus) 16f else 0f
            binding.focusRing.visibility = if (hasFocus) View.VISIBLE else View.INVISIBLE
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val inflater = LayoutInflater.from(parent.context)
        val vh = VH(ItemRailCardBinding.inflate(inflater, parent, false))
        vh.binding.root.layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        )
        val lp = vh.binding.root.layoutParams as? ViewGroup.MarginLayoutParams
        lp?.let {
            it.marginEnd = 0
            it.marginStart = 0
            vh.binding.root.layoutParams = it
        }
        return vh
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = getItem(position)
        val res = holder.itemView.resources
        val ctx = holder.itemView.context

        with(holder.binding) {
            cardTitle.text = item.name
            cardSubtitle.text = when {
                item.isFolder -> "pasta"
                item.isVideo -> "vídeo · ${item.humanSize}"
                item.isAudio -> "áudio · ${item.humanSize}"
                item.isPdf -> "PDF · ${item.humanSize}"
                else -> item.humanSize
            }
            cardIcon.text = when {
                item.isFolder -> "\uD83D\uDCC1"
                item.isVideo  -> "\uD83C\uDFA5"
                item.isAudio  -> "\uD83C\uDFB5"
                item.isPdf    -> "\uD83D\uDCC4"
                else          -> "\uD83D\uDCC4"
            }

            // Per-card gradient background (always set as fallback under thumbnail)
            val baseColor = colorFromString(item.name)
            cardBg.background = tileGradientDrawable(res, baseColor)

            // ★ v2.1.0: Load real thumbnail via Coil (videos + PDFs only).
            // Folders don't have thumbnails — show emoji + gradient.
            val thumbUrl = item.thumbnailLink
            if (thumbUrl != null && (item.isVideo || item.isPdf || item.isAudio)) {
                cardThumbnail.visibility = View.VISIBLE
                cardIcon.visibility = View.GONE
                val loader = getOrCreateImageLoader(ctx)
                val request = ImageRequest.Builder(ctx)
                    .data(thumbUrl)
                    .target(
                        onStart = { /* gradient shows underneath as placeholder */ },
                        onSuccess = { result ->
                            cardThumbnail.setImageDrawable(result)
                        },
                        onError = { 
                            // Thumbnail failed — show emoji fallback
                            cardThumbnail.visibility = View.GONE
                            cardIcon.visibility = View.VISIBLE
                        }
                    )
                    .build()
                loader.enqueue(request)
            } else {
                cardThumbnail.visibility = View.GONE
                cardIcon.visibility = View.VISIBLE
            }

            // ★ v2.1.0: Real progress bar (was hardcoded 35%).
            val isVideo = item.isVideo
            if (isVideo) {
                val sm = SessionManager.get(ctx)
                val progress = sm.getResumeProgress(currentFolderPath, item.name)
                if (progress > 0) {
                    progressBar.visibility = View.VISIBLE
                    cardBg.post {
                        val w = cardBg.width
                        if (w > 0) {
                            val lp = progressBar.layoutParams
                            lp.width = (w * progress / 100).coerceAtLeast(1)
                            progressBar.layoutParams = lp
                        }
                    }
                } else {
                    progressBar.visibility = View.GONE
                }
            } else {
                progressBar.visibility = View.GONE
            }

            // "continuar" badge on videos with a resume position.
            val showResume = isVideo && item.name in resumedNames
            continueBadge.visibility = if (showResume) View.VISIBLE else View.GONE

            // Watched ✓ on videos watched to the end.
            val showWatched = isVideo && item.name in watchedNames
            watchedBadge.visibility = if (showWatched) View.VISIBLE else View.GONE
        }

        playAppear(holder, position)
    }

    private fun playAppear(holder: VH, position: Int) {
        val anim = AnimationUtils.loadAnimation(holder.itemView.context, R.anim.tile_appear)
        val delay = (position % 12) * 40L
        anim.startOffset = delay.coerceAtMost(320L)
        holder.binding.root.startAnimation(anim)
    }

    private fun tileGradientDrawable(res: android.content.res.Resources, baseColor: Int): GradientDrawable {
        val r = Color.red(baseColor)
        val g = Color.green(baseColor)
        val b = Color.blue(baseColor)
        val start = Color.argb(0x59, r, g, b)
        val end = Color.parseColor("#FF0F1218")
        val cornerPx = (16 * res.displayMetrics.density)
        return GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            intArrayOf(start, end)
        ).apply {
            cornerRadius = cornerPx
        }
    }

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<FileItem>() {
            override fun areItemsTheSame(o: FileItem, n: FileItem) = o.id == n.id
            override fun areContentsTheSame(o: FileItem, n: FileItem) = o == n
        }

        @Volatile
        private var sharedImageLoader: ImageLoader? = null

        /** v2.1.0 — Singleton Coil ImageLoader with memory cache. */
        fun getOrCreateImageLoader(ctx: Context): ImageLoader {
            return sharedImageLoader ?: synchronized(this) {
                sharedImageLoader ?: ImageLoader.Builder(ctx.applicationContext)
                    .memoryCache {
                        MemoryCache.Builder(ctx.applicationContext)
                            .maxSizePercent(0.25)
                            .build()
                    }
                    .crossfade(true)
                    .build().also { sharedImageLoader = it }
            }
        }
    }
}
