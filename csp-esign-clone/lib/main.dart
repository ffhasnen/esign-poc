import 'dart:async';
// ignore: avoid_web_libraries_in_flutter
import 'dart:js' as js;

import 'package:flutter/material.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'CSP eSign Clone',
      home: const EsignDemoPage(),
    );
  }
}

class EsignDemoPage extends StatefulWidget {
  const EsignDemoPage({super.key});

  @override
  State<EsignDemoPage> createState() => _EsignDemoPageState();
}

class _EsignDemoPageState extends State<EsignDemoPage> {
  final _urlController = TextEditingController(
    text: 'https://example-app-ff--perfios-simulation-xrtyd1tg.web.app/',
  );
  final List<String> _log = [];
  bool _busy = false;

  void _addLog(String msg) {
    final ts = DateTime.now().toIso8601String().substring(11, 19);
    setState(() => _log.add('$ts  $msg'));
  }

  Future<void> _startEsign() async {
    final signUrl = _urlController.text;
    setState(() => _busy = true);
    _addLog('Calling actions.eSignature(context, "$signUrl") ...');
    final result = await eSignature(signUrl, _addLog);
    setState(() => _busy = false);
    _addLog(result == true
        ? 'RESULT: SUCCESS'
        : result == false
            ? 'RESULT: FAIL'
            : 'RESULT: unknown / no bridge found');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('CSP eSign Clone (Flutter Web)')),
      body: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Mirrors bu_info_pre_confirmation_d_b_t_r_i_b_v3_widget.dart: '
              'a button that calls actions.eSignature(context, signUrl).',
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _urlController,
              decoration: const InputDecoration(
                labelText: 'signUrl',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: _busy ? null : _startEsign,
              child: Text(_busy ? 'Waiting for eSign...' : 'Confirm & Proceed (eSign)'),
            ),
            const SizedBox(height: 12),
            const Text('Log:', style: TextStyle(fontWeight: FontWeight.bold)),
            Expanded(
              child: Container(
                width: double.infinity,
                color: Colors.black,
                padding: const EdgeInsets.all(8),
                child: SingleChildScrollView(
                  reverse: true,
                  child: Text(
                    _log.join('\n'),
                    style: const TextStyle(
                      color: Colors.greenAccent,
                      fontFamily: 'monospace',
                      fontSize: 12,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Same shape as the real lib/custom_code/actions/e_signature.dart:
/// calls window.esignProcess.esignCall(signUrl) via dart:js, then polls
/// js.context['isSuccess'] until it's set (with a demo-only 60s timeout so
/// the UI doesn't spin forever if window.open() is blocked and nothing
/// else ever resolves it - the exact hang bug from production).
Future<bool?> eSignature(String signUrl, void Function(String) log) async {
  js.context['isSuccess'] = null;
  js.context['esignRawPayload'] = null;
  js.context['esignResponse'] = null;
  if (!js.context.hasProperty('esignProcess')) {
    log('esignProcess not found on window');
    return null;
  }
  final perfiosEsign = js.context['esignProcess'];
  if (!perfiosEsign.hasProperty('esignCall')) {
    log('esignCall method not found on esignProcess');
    return null;
  }
  perfiosEsign.callMethod('esignCall', [signUrl]);

  bool? result;
  var waitedMs = 0;
  do {
    await Future.delayed(const Duration(milliseconds: 300));
    waitedMs += 300;
    final isSuccess = js.context['isSuccess'];
    if (isSuccess != null) {
      result = isSuccess as bool;
    }
    if (waitedMs > 60000) {
      log('timed out after 60s waiting for isSuccess - this is the hang bug '
          'if window.open() never delivered a result');
      break;
    }
  } while (result == null);

  final rawPayload = js.context['esignRawPayload'] as String?;
  final response = js.context['esignResponse'] as String?;
  log('Raw payload from eSign page: ${rawPayload ?? "(none received)"}');
  log('PerfiosEsign callback payload: ${response ?? "(none received)"}');

  return result;
}
