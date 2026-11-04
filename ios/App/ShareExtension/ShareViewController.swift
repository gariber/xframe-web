import UIKit
import UniformTypeIdentifiers

/// 在 X 或 Threads 按「分享」→ PostCard：不顯示任何畫面，把分享進來的網址（或含網址的文字）
/// 包成 `xframe://card?url=…` 叫醒主 app，自己立刻收掉。挑網址、清追蹤參數都交給主 app。
final class ShareViewController: UIViewController {
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        Task { await forward() }
    }

    private func forward() async {
        let shared = await sharedText()
        if let shared, let target = launchURL(for: shared) {
            open(target)
        }
        extensionContext?.completeRequest(returningItems: nil)
    }

    /// 先拿網址，沒有網址再拿純文字（有些 app 分享的是「內文＋網址」）。
    private func sharedText() async -> String? {
        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? [])
            .flatMap { $0.attachments ?? [] }
        for type in [UTType.url, UTType.plainText] {
            for provider in providers where provider.hasItemConformingToTypeIdentifier(type.identifier) {
                if let item = try? await provider.loadItem(forTypeIdentifier: type.identifier) {
                    if let url = item as? URL { return url.absoluteString }
                    if let text = item as? String { return text }
                }
            }
        }
        return nil
    }

    private func launchURL(for shared: String) -> URL? {
        var components = URLComponents()
        components.scheme = "xframe"
        components.host = "card"
        components.queryItems = [URLQueryItem(name: "url", value: shared)]
        return components.url
    }

    /// 延伸功能拿不到 UIApplication.shared，沿 responder chain 找到它再開網址。
    ///
    /// `open(_:options:completionHandler:)` 在延伸功能裡編譯期不給用（延伸一定要以
    /// APPLICATION_EXTENSION_API_ONLY 建置），所以經 Objective-C runtime 呼叫同一個方法。
    private func open(_ url: URL) {
        typealias OpenURL = @convention(c) (AnyObject, Selector, NSURL, NSDictionary, AnyObject?) -> Void
        let selector = NSSelectorFromString("openURL:options:completionHandler:")
        var responder: UIResponder? = self
        while let current = responder {
            if let application = current as? UIApplication, application.responds(to: selector) {
                let call = unsafeBitCast(application.method(for: selector), to: OpenURL.self)
                call(application, selector, url as NSURL, NSDictionary(), nil)
                return
            }
            responder = current.next
        }
    }
}
