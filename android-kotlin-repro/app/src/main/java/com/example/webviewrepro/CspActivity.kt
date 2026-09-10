package com.example.webviewrepro

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.os.Message
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.example.webviewrepro.databinding.ActivityCspBinding

/**
 * WebView 1: loads the CSP (Flutter Web) page directly, full screen - IMobile
 * loads the CSP URL straight into its native WebView, no wrapper page and no
 * iframe in between.
 *
 * Its eSign button calls window.open() from the CSP page's own top-level
 * window, same as production. We intercept that via
 * WebChromeClient.onCreateWindow, but instead of showing a same-Activity
 * Dialog we hand the target URL off to a separate full-screen Activity
 * (EsignActivity/WebView 2), launched with registerForActivityResult so this
 * Activity is naturally backgrounded while it's up, and resumes automatically
 * when it finishes.
 *
 * onCreateWindow does not give you the target URL directly - only a
 * WebView.WebViewTransport to attach a WebView to. We attach a throwaway,
 * never-shown WebView just to read the URL from its first onPageStarted
 * (which fires reliably, unlike shouldOverrideUrlLoading on a WebView's very
 * first load), then stop it and discard it.
 */
class CspActivity : AppCompatActivity() {

    private lateinit var binding: ActivityCspBinding
    private lateinit var baseUrl: String

    private val esignLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val json = result.data?.getStringExtra(EsignActivity.EXTRA_RESULT_JSON)
        if (json != null) {
            deliverResultToWebView(json)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityCspBinding.inflate(layoutInflater)
        setContentView(binding.root)

        baseUrl = (intent.getStringExtra(EXTRA_BASE_URL)
            ?: "https://example-app-ff--csp-esign-clone-xmfe0dvz.web.app")
            .trimEnd('/')

        val webView = binding.cspWebView
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.javaScriptCanOpenWindowsAutomatically = true
        webView.settings.setSupportMultipleWindows(true)
        webView.webViewClient = WebViewClient()
        webView.webChromeClient = object : WebChromeClient() {
            override fun onCreateWindow(
                view: WebView,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: Message
            ): Boolean {
                val transportWebView = WebView(this@CspActivity).apply {
                    settings.javaScriptEnabled = true
                    webViewClient = object : WebViewClient() {
                        override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                            view.stopLoading()
                            launchEsignActivity(url)
                        }
                    }
                }
                val transport = resultMsg.obj as WebView.WebViewTransport
                transport.webView = transportWebView
                resultMsg.sendToTarget()
                return true
            }
        }
        webView.loadUrl("$baseUrl/")
    }

    private fun launchEsignActivity(url: String) {
        val host = Uri.parse(url).host
        if (host == null || host !in TRUSTED_ESIGN_HOSTS) {
            // Refuse to open unknown content full screen with a native
            // bridge attached - only the real eSign provider's domain
            // should ever get that capability.
            return
        }
        val intent = Intent(this, EsignActivity::class.java)
        intent.putExtra(EsignActivity.EXTRA_URL, url)
        esignLauncher.launch(intent)
    }

    private fun deliverResultToWebView(payloadJson: String) {
        // No iframe here - the CSP page IS the top-level document, so we
        // post straight onto its own window (same as a real popup would via
        // window.opener.postMessage - just delivered by native code instead).
        val js = "window.postMessage($payloadJson, '*');"
        binding.cspWebView.evaluateJavascript(js, null)
    }

    companion object {
        const val EXTRA_BASE_URL = "extra_base_url"

        // Demo-only: the PerfiosEsign Simulation's real host. Production
        // needs the real Perfios/UIDAI domain(s) here instead - not
        // something to guess.
        private val TRUSTED_ESIGN_HOSTS = setOf(
            "example-app-ff--perfios-simulation-xrtyd1tg.web.app"
        )
    }
}
