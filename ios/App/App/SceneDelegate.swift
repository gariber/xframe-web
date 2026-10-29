import UIKit
import Capacitor

/// iOS 27 起，沒有採用 UIScene 生命週期的 app 一啟動就會被系統中止（實測 iPhone、iOS 27.2）。
/// 畫面照舊由 Main.storyboard 載入；這裡只負責把開啟網址（分享延伸功能叫醒 app 的
/// `xframe://card?url=…`）轉給 Capacitor——用了 scene 之後，網址不再走 AppDelegate。
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        // 冷啟動：app 原本沒開，網址跟著連線選項一起來。轉給 Capacitor 之後 getLaunchUrl 讀得到。
        forward(connectionOptions.urlContexts)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        // 熱啟動：app 在背景，這裡會觸發 appUrlOpen。
        forward(URLContexts)
    }

    private func forward(_ contexts: Set<UIOpenURLContext>) {
        for context in contexts {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: [:])
        }
    }
}
