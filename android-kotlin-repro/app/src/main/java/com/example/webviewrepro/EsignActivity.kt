package com.example.webviewrepro

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import com.example.webviewrepro.databinding.ActivityEsignBinding
import org.json.JSONException
import org.json.JSONObject

/**
 * WebView 2: full-screen eSign page (stands in for Perfios/UIDAI). Its
 * "Simulate SUCCESS"/"Simulate FAIL" buttons (popup.html) find window.opener
 * is null here (this is a separate WebView/Activity, not a real popup), so
 * they fall back to window.AndroidEsignBridge.postMessage(json) - which this
 * Activity turns into its own Activity result, then finishes, handing
 * control (and the JSON payload) back to CspActivity/WebView 1.
 */
class EsignActivity : AppCompatActivity() {

    private lateinit var binding: ActivityEsignBinding

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityEsignBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val url = intent.getStringExtra(EXTRA_URL)
        if (url == null) {
            finish()
            return
        }

        val webView = binding.esignWebView
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.webViewClient = WebViewClient()
        webView.addJavascriptInterface(EsignBridge(), "AndroidEsignBridge")
        webView.loadUrl(url)
    }

    inner class EsignBridge {
        @JavascriptInterface
        fun postMessage(json: String) {
            // Parse (and re-serialize) before this ever reaches a WebView
            // again - the raw string comes from web content we don't fully
            // trust, and pasting it straight into a JS snippet later would
            // let it break out and run arbitrary code. A clean re-serialized
            // JSONObject can't do that; anything that fails to parse is
            // dropped rather than passed on.
            val validated = try {
                JSONObject(json).toString()
            } catch (e: JSONException) {
                null
            } ?: return
            runOnUiThread {
                val resultIntent = Intent().putExtra(EXTRA_RESULT_JSON, validated)
                setResult(RESULT_OK, resultIntent)
                finish()
            }
        }
    }

    companion object {
        const val EXTRA_URL = "extra_url"
        const val EXTRA_RESULT_JSON = "extra_result_json"
    }
}
