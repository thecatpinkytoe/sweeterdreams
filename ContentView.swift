import SwiftUI

struct ContentView: View {
    @EnvironmentObject var hm: HealthStoreManager
    @State private var exporting = false
    @State private var exportedURL: URL?
    @State private var showShare = false
    @State private var progressText = "Idle"
    @State private var startDate: Date = Calendar.current.date(byAdding: .year, value: -1, to: Date()) ?? Date()
    @State private var endDate: Date = Date()

    var body: some View {
        NavigationView {
            VStack(spacing: 16) {
                Text("Health Exporter").font(.title2).bold()
                Text("Export compact NDJSON (+ optional gzip) for your analyzer.").font(.subheadline).foregroundColor(.secondary)

                DatePicker("Start date", selection: $startDate, displayedComponents: .date)
                DatePicker("End date", selection: $endDate, displayedComponents: .date)

                HStack {
                    Button(action: authorize) {
                        Text(hm.authorized ? "Authorized ✅" : "Request HealthKit Access")
                    }.disabled(hm.authorized)

                    Button(action: startExport) {
                        Text(exporting ? "Exporting..." : "Export to NDJSON")
                    }
                    .disabled(exporting || !hm.authorized)
                }

                Text(progressText).font(.caption).foregroundColor(.gray)

                if let url = exportedURL {
                    Button("Share exported file") {
                        showShare = true
                    }
                    .sheet(isPresented: $showShare) {
                        ActivityView(activityItems: [url])
                    }
                }

                Spacer()
            }
            .padding()
            .navigationTitle("HealthExporter")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    func authorize() {
        hm.requestAuthorization { ok, err in
            DispatchQueue.main.async {
                if ok { progressText = "Authorized" } else { progressText = "Authorization failed" }
            }
        }
    }

    func startExport() {
        exporting = true
        progressText = "Starting export..."
        let filename = "health-export-\(ISO8601DateFormatter().string(from: Date()))"
        hm.export(to: filename, startDate: startDate, endDate: endDate, gzip: true, progress: { msg in
            DispatchQueue.main.async { progressText = msg }
        }, completion: { url, err in
            DispatchQueue.main.async {
                exporting = false
                if let err = err { progressText = "Export error: \(err.localizedDescription)" }
                else if let url = url { exportedURL = url; progressText = "Exported to \(url.lastPathComponent)" }
            }
        })
    }
}
