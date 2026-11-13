# ProGuard rules for Meggy Native App

# Keep Meggy app classes
-keep class com.meggy.app.** { *; }

# Keep data models (used by JSON reflection)
-keep class com.meggy.app.data.** { *; }
-keepclassmembers class com.meggy.app.data.** {
    public <fields>;
    public <init>();
}

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

# Media3 / ExoPlayer
-keep class androidx.media3.** { *; }
-dontwarn androidx.media3.**

# Material components
-keep class com.google.android.material.** { *; }
-dontwarn com.google.android.material.**

# Kotlin coroutines
-keepclassmembernames class kotlinx.** { volatile <fields>; }

# Glide
-keep public class * implements com.bumptech.glide.module.GlideModule
-keep class * extends com.bumptech.glide.module.AppGlideModule { <init>(...); }
-keep public enum com.bumptech.glide.load.ImageHeaderParser$** {
    **[] $VALUES;
    public *;
}
-keep class com.bumptech.glide.load.data.ParcelFileDescriptorRewinder$InternalRewinder { *** rewind(); }
