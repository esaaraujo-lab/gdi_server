package com.meggy.app.util

import android.content.Context
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.datasource.okhttp.OkHttpDataSource
import okhttp3.OkHttpClient

/**
 * v2.7.6 — Cache de vídeo (Ajustes → "Baixar só no Wi-Fi").
 *
 * MÍNIMO REAL: não existe botão de download nem lista offline no app.
 * O que existe: o ExoPlayer passa a gravar em cache (SimpleCache, teto
 * de 500 MB com evicção LRU) os bytes do vídeo que já foram assistidos,
 * e a releitura usa o cache em vez de baixar de novo.
 *
 * A preferência "Baixar só no Wi-Fi" controla a ESCRITA no cache:
 * - Ligada (padrão): o cache só grava quando a rede ativa é Wi-Fi
 *   (ConnectivityManager / NetworkCapabilities). Em dados móveis o
 *   vídeo toca direto da rede, sem gravar.
 * - Desligada: o cache grava em qualquer rede.
 *
 * A LEITURA do cache acontece sempre (reassistir um trecho já gravado
 * não consome dados). O cache é por URL autenticada (cookie de sessão
 * no header, como antes) e expira por LRU quando cheio.
 */
object VideoCache {
    private const val MAX_BYTES = 500L * 1024L * 1024L

    @Volatile
    private var cache: SimpleCache? = null

    private fun getCache(context: Context): SimpleCache {
        return cache ?: synchronized(this) {
            cache ?: SimpleCache(
                java.io.File(context.cacheDir, "video-cache"),
                LeastRecentlyUsedCacheEvictor(MAX_BYTES),
                androidx.media3.database.StandaloneDatabaseProvider(context)
            ).also { cache = it }
        }
    }

    /** DataSourceFactory com cache; `writeToCache` decide se grava. */
    fun dataSourceFactory(
        context: Context,
        okHttpClient: OkHttpClient,
        writeToCache: Boolean,
        requestProperties: Map<String, String> = emptyMap()
    ): CacheDataSource.Factory {
        val upstream = OkHttpDataSource.Factory(okHttpClient)
            .setDefaultRequestProperties(requestProperties)
        val factory = CacheDataSource.Factory()
            .setCache(getCache(context))
            .setUpstreamDataSourceFactory(upstream)
        if (!writeToCache) {
            // Não grava: lê do cache se existir, mas não escreve nele.
            factory.setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
            factory.setCacheWriteDataSinkFactory(null)
        }
        return factory
    }

    fun isWifi(context: Context): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE)
            as? android.net.ConnectivityManager ?: return false
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI)
    }
}
