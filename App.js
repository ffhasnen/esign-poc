import React, { useRef, useState } from 'react';
import {
  SafeAreaView, View, Text, TextInput, Button, StyleSheet, Modal, Linking, Pressable,
} from 'react-native';
import { WebView } from 'react-native-webview';

// Reproduction app for: window.open()/postMessage popup flow inside a nested
// iframe, hosted inside a react-native-webview WebView.
//
// Three modes, cycling through the failure/fix progression:
//
// - "default": no popup support wired up at all (the RN WebView default).
//   window.open() gets "treated as a top-level navigation instead" - the
//   popup content replaces the whole view in place. This is what was
//   observed when testing against a same-origin popup.
//
// - "domain-guard": same as default, PLUS an onShouldStartLoadWithRequest
//   handler that allowlists the app's own origin and hands anything else
//   (like the cross-origin popup.html, standing in for the real eSign
//   provider's domain) off to the system browser via Linking.openURL. This
//   simulates the kind of native URL interception a banking app commonly
//   has for security, and should reproduce "clicking eSign opens the web
//   browser" exactly as seen in the real IMobile app.
//
// - "bridge-fix": wires up onOpenWindow + javaScriptCanOpenWindowsAutomatically
//   + setSupportMultipleWindows so the popup opens as an in-app modal WebView,
//   and relays its result back into the ORIGINAL iframe via injectJavaScript
//   instead of relying on window.opener (which is null either way - see the
//   popup's own on-screen status).
const MODES = ['default', 'domain-guard', 'bridge-fix'];

export default function App() {
  const [baseUrl, setBaseUrl] = useState('http://192.168.1.10:8787');
  const [mode, setMode] = useState('default');
  const [loaded, setLoaded] = useState(false);
  const [popupUrl, setPopupUrl] = useState(null);
  const mainWebViewRef = useRef(null);

  const ownOrigin = baseUrl.replace(/\/$/, '');

  const handleOpenWindow = (syntheticEvent) => {
    const { nativeEvent } = syntheticEvent;
    setPopupUrl(nativeEvent.targetUrl);
  };

  const handleShouldStartLoad = (request) => {
    if (mode !== 'domain-guard') return true;
    if (request.url.startsWith(ownOrigin)) return true;
    // Not our own domain - mimic a bank app's domain allowlist kicking
    // third-party content (the eSign provider) out to the system browser
    // instead of loading it inside the secure in-app WebView.
    Linking.openURL(request.url).catch(() => {});
    return false;
  };

  const handlePopupMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'ESIGN_RESULT') {
        const js = `
          (function () {
            var frame = document.getElementById('kycFrame');
            if (frame && frame.contentWindow) {
              frame.contentWindow.postMessage(${JSON.stringify(data.payload)}, '*');
            }
          })(); true;
        `;
        mainWebViewRef.current && mainWebViewRef.current.injectJavaScript(js);
      }
    } catch (e) {
      // ignore
    }
    setPopupUrl(null);
  };

  const outerUrl = ownOrigin + '/outer.html';
  const bridgeOn = mode === 'bridge-fix';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.controls}>
        <Text>Server base URL (own-app port from `node serve.js`):</Text>
        <TextInput
          style={styles.input}
          value={baseUrl}
          onChangeText={setBaseUrl}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={{ marginBottom: 4 }}>Mode:</Text>
        <View style={styles.row}>
          {MODES.map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
            >
              <Text style={mode === m ? styles.modeTextActive : styles.modeText}>{m}</Text>
            </Pressable>
          ))}
        </View>
        <Button title={loaded ? 'Reload' : 'Load outer.html'} onPress={() => setLoaded(true)} />
      </View>

      {loaded && (
        <WebView
          ref={mainWebViewRef}
          style={styles.webview}
          source={{ uri: outerUrl }}
          javaScriptCanOpenWindowsAutomatically={bridgeOn}
          setSupportMultipleWindows={bridgeOn}
          onOpenWindow={bridgeOn ? handleOpenWindow : undefined}
          onShouldStartLoadWithRequest={handleShouldStartLoad}
          onMessage={() => {}}
        />
      )}

      <Modal visible={!!popupUrl} animationType="slide">
        <SafeAreaView style={{ flex: 1 }}>
          <Button title="Close popup" onPress={() => setPopupUrl(null)} />
          {popupUrl && (
            <WebView source={{ uri: popupUrl }} onMessage={handlePopupMessage} />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 40 },
  controls: { padding: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 8, borderRadius: 6, marginVertical: 8 },
  row: { flexDirection: 'row', marginBottom: 8 },
  modeBtn: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: '#ccc', marginRight: 8 },
  modeBtnActive: { backgroundColor: '#2f6fed', borderColor: '#2f6fed' },
  modeText: { color: '#333' },
  modeTextActive: { color: '#fff', fontWeight: 'bold' },
  webview: { flex: 1 },
});
