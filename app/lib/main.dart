import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

// ═══════════════════════════════════════════════════════════════
// GDI Index — Flutter Shell App
//
// Wrapper que abre educa.eu.org em uma WebView com:
// - Suporte a D-pad (controle remoto Android TV / Google TV)
// - Persistência de cookies (mantém login entre sessões)
// - Splash screen
// - Detecção de Android TV (modo leanback)
// ═══════════════════════════════════════════════════════════════

const String SITE_URL = 'https://educa.eu.org/';

void main() {
  runApp(const GDIApp());
}

class GDIApp extends StatelessWidget {
  const GDIApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'GDI Index — Educa/Meggy',
      theme: ThemeData(
        primarySwatch: Colors.pink,
        useMaterial3: true,
        brightness: Brightness.dark,
      ),
      home: const SplashScreen(),
      debugShowCheckedModeBanner: false,
    );
  }
}

// ═══ SplashScreen ═══
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _navigateToHome();
  }

  _navigateToHome() async {
    await Future.delayed(const Duration(seconds: 2));
    if (mounted) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (context) => const WebViewScreen()),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFFFF8B9F), Color(0xFFC026D3), Color(0xFF5DDEDA)],
          ),
        ),
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: const [
              Text('🐩', style: TextStyle(fontSize: 80)),
              SizedBox(height: 16),
              Text(
                'Educa / Meggy',
                style: TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
              SizedBox(height: 8),
              Text(
                'Plataforma de Estudos',
                style: TextStyle(fontSize: 14, color: Colors.white70),
              ),
              SizedBox(height: 32),
              CircularProgressIndicator(color: Colors.white),
            ],
          ),
        ),
      ),
    );
  }
}

// ═══ WebView Screen ═══
class WebViewScreen extends StatefulWidget {
  const WebViewScreen({super.key});

  @override
  State<WebViewScreen> createState() => _WebViewScreenState();
}

class _WebViewScreenState extends State<WebViewScreen> {
  late final WebViewController _controller;
  bool _isLoading = true;
  String _currentUrl = SITE_URL;

  @override
  void initState() {
    super.initState();
    _initController();
  }

  void _initController() {
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF0D1117))
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (url) {
            setState(() {
              _isLoading = true;
              _currentUrl = url;
            });
          },
          onPageFinished: (url) async {
            setState(() => _isLoading = false);
            // Salva URL atual para restaurar depois
            final prefs = await SharedPreferences.getInstance();
            await prefs.setString('last_url', url);
          },
        ),
      )
      ..loadRequest(Uri.parse(SITE_URL));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // WebView
          Focus(
            autofocus: true,
            onKeyEvent: _handleKeyEvent,
            child: WebViewWidget(controller: _controller),
          ),
          // Loading indicator
          if (_isLoading)
            const Center(
              child: CircularProgressIndicator(color: Color(0xFFFF8B9F)),
            ),
        ],
      ),
    );
  }

  // ═══ D-pad Navigation Handler (Android TV / Google TV) ═══
  KeyEventResult _handleKeyEvent(FocusNode node, KeyEvent event) {
    // D-pad up/down/left/right → scroll a página
    // Enter → click no elemento focado
    // Back → voltar na história do browser
    final key = event.logicalKey;

    if (key == LogicalKeyboardKey.arrowUp) {
      _controller.runJavaScript('window.scrollBy(0, -200)');
      return KeyEventResult.handled;
    } else if (key == LogicalKeyboardKey.arrowDown) {
      _controller.runJavaScript('window.scrollBy(0, 200)');
      return KeyEventResult.handled;
    } else if (key == LogicalKeyboardKey.arrowLeft) {
      _controller.runJavaScript('window.scrollBy(-200, 0)');
      return KeyEventResult.handled;
    } else if (key == LogicalKeyboardKey.arrowRight) {
      _controller.runJavaScript('window.scrollBy(200, 0)');
      return KeyEventResult.handled;
    } else if (key == LogicalKeyboardKey.select ||
               key == LogicalKeyboardKey.enter) {
      _controller.runJavaScript('document.activeElement?.click()');
      return KeyEventResult.handled;
    } else if (key == LogicalKeyboardKey.goBack ||
               key == LogicalKeyboardKey.escape) {
      _controller.canGoBack().then((can) {
        if (can) _controller.goBack();
      });
      return KeyEventResult.handled;
    }

    return KeyEventResult.ignored;
  }
}
