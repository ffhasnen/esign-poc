package com.example.webviewrepro

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.example.webviewrepro.databinding.ActivityMainBinding

/**
 * Launcher screen: just a base URL field and a "Launch CSP" button that
 * starts CspActivity (WebView 1) full screen, exactly like the host app
 * would launch the CSP servicing flow.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.launchCspBtn.setOnClickListener {
            val baseUrl = binding.baseUrlInput.text.toString().trimEnd('/')
            val intent = Intent(this, CspActivity::class.java)
            intent.putExtra(CspActivity.EXTRA_BASE_URL, baseUrl)
            startActivity(intent)
        }
    }
}
