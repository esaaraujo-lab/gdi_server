package com.meggy.app.util

import android.content.Context
import com.meggy.app.data.FileItem
import org.json.JSONArray
import org.json.JSONObject

/**
 * PlaylistManager — v1.2.0
 *
 * Holds the current playback queue plus the index of the video currently
 * playing. Persists to SharedPreferences so the queue survives activity
 * recreation / process death.
 *
 * v1.2.0 additions:
 *  • Each item now carries an optional `folderLabel` (short subfolder name,
 *    shown in the playlist sidebar to disambiguate cross-folder entries) and
 *    `folderPath` (full path, used by PlayerActivity to key per-(folder, video)
 *    resume positions). Both are serialised into the persisted JSON.
 *
 * BrowseActivity calls [setPlaylist] (with either a same-folder list or the
 * output of [CrossFolderPlaylist.build]) right before launching
 * PlayerActivity. PlayerActivity then calls [loadPlaylist] and uses
 * [getNext] / [getPrev] / [setIndex] to navigate.
 *
 * Serialization uses org.json only — no Gson dependency.
 */
object PlaylistManager {

    private const val PREFS = "meggy_playlist"
    private const val KEY_ITEMS = "items"
    private const val KEY_INDEX = "index"

    private var items: MutableList<FileItem> = mutableListOf()
    private var currentIndex: Int = 0

    /** Application context retained so we can persist index changes lazily. */
    private var appContext: Context? = null

    /** Replace the whole queue. Called from BrowseActivity when a video is opened. */
    fun setPlaylist(videos: List<FileItem>, startIndex: Int, context: Context) {
        appContext = context.applicationContext
        items = videos.toMutableList()
        currentIndex = if (items.isEmpty()) 0 else startIndex.coerceIn(0, items.size - 1)
        persist()
    }

    /** Reload the queue from disk. Called from PlayerActivity.onCreate. */
    fun loadPlaylist(context: Context) {
        appContext = context.applicationContext
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val jsonStr = prefs.getString(KEY_ITEMS, null) ?: return
        currentIndex = prefs.getInt(KEY_INDEX, 0)
        try {
            val arr = JSONArray(jsonStr)
            items = mutableListOf()
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                val linkStr = if (o.has("link") && !o.isNull("link")) o.getString("link") else ""
                items.add(
                    FileItem(
                        name = o.optString("name"),
                        mimeType = o.optString("mimeType", "application/octet-stream"),
                        id = o.optString("id"),
                        driveId = null,
                        link = linkStr.ifEmpty { null },
                        size = o.optLong("size", 0L),
                        modifiedTime = null,
                        // v1.2.0: restore disambiguation + resume-key fields
                        folderLabel = if (o.has("folderLabel") && !o.isNull("folderLabel"))
                            o.getString("folderLabel") else null,
                        folderPath = if (o.has("folderPath") && !o.isNull("folderPath"))
                            o.getString("folderPath") else null
                    )
                )
            }
            if (currentIndex > items.size - 1) currentIndex = (items.size - 1).coerceAtLeast(0)
        } catch (_: Exception) {
            items = mutableListOf()
            currentIndex = 0
        }
    }

    private fun persist() {
        val ctx = appContext ?: return
        val json = JSONArray()
        for (item in items) {
            json.put(JSONObject().apply {
                put("name", item.name)
                put("mimeType", item.mimeType)
                put("id", item.id)
                put("link", item.link ?: JSONObject.NULL)
                put("size", item.size)
                // v1.2.0: persist disambiguation + resume-key fields
                put("folderLabel", item.folderLabel ?: JSONObject.NULL)
                put("folderPath", item.folderPath ?: JSONObject.NULL)
            })
        }
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_ITEMS, json.toString())
            .putInt(KEY_INDEX, currentIndex)
            .apply()
    }

    fun getCurrent(): FileItem? = items.getOrNull(currentIndex)

    /** Advance to the next video and return it (or null if at the end). */
    fun getNext(): FileItem? {
        if (currentIndex < items.size - 1) {
            currentIndex++
            persist()
        }
        return getCurrent()
    }

    /** Go back to the previous video and return it (or null if at the start). */
    fun getPrev(): FileItem? {
        if (currentIndex > 0) {
            currentIndex--
            persist()
        }
        return getCurrent()
    }

    /** Jump to an arbitrary position (used by the playlist sidebar clicks). */
    fun setIndex(position: Int) {
        if (position in 0 until items.size) {
            currentIndex = position
            persist()
        }
    }

    fun hasNext(): Boolean = currentIndex < items.size - 1
    fun hasPrev(): Boolean = currentIndex > 0
    fun size(): Int = items.size
    fun index(): Int = currentIndex
    fun all(): List<FileItem> = items.toList()

    fun clear() {
        items = mutableListOf()
        currentIndex = 0
        appContext?.getSharedPreferences(PREFS, Context.MODE_PRIVATE)?.edit()?.clear()?.apply()
    }
}
