import SwiftUI

@main
struct HealthExportKitApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView().environmentObject(HealthStoreManager.shared)
        }
    }
}
