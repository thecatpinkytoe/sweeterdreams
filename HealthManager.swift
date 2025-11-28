import Foundation
import HealthKit
import Compression

struct CompactRecord: Codable {
    var type: String
    var startDate: Int64 // ms since epoch
    var endDate: Int64?
    var value: Double?
    var unit: String?
    var source: String?
    var device: String?
    var metadata: [String:String]?
}

final class HealthStoreManager: NSObject, ObservableObject {
    static let shared = HealthStoreManager()
    private let store = HKHealthStore()
    @Published var authorized = false
    let fileManager = FileManager.default

    // Types to request (can be extended)
    var readTypes: Set<HKObjectType> {
        var s = Set<HKObjectType>()
        if let t = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { s.insert(t) }
        if let t = HKObjectType.quantityType(forIdentifier: .heartRate) { s.insert(t) }
        if let t = HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDAN) ?? nil { /* fallback */ }
        if let t = HKObjectType.quantityType(forIdentifier: .respiratoryRate) { s.insert(t) }
        if let t = HKObjectType.quantityType(forIdentifier: .oxygenSaturation) { s.insert(t) }
        // add other types as needed
        return s
    }

    func requestAuthorization(completion: @escaping (Bool, Error?) -> Void) {
        let types = readTypes
        store.requestAuthorization(toShare: nil, read: types) { success, error in
            DispatchQueue.main.async {
                self.authorized = success
                completion(success, error)
            }
        }
    }

    // Export function: writes NDJSON, optionally gzips output.
    func export(to filenameBase: String, startDate: Date, endDate: Date, gzip: Bool = true, progress: @escaping (String) -> Void, completion: @escaping (URL?, Error?) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let docs = try self.fileManager.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
                let ndjsonURL = docs.appendingPathComponent("\(filenameBase).ndjson")
                if self.fileManager.fileExists(atPath: ndjsonURL.path) {
                    try self.fileManager.removeItem(at: ndjsonURL)
                }
                self.fileManager.createFile(atPath: ndjsonURL.path, contents: nil, attributes: nil)
                guard let handle = try? FileHandle(forWritingTo: ndjsonURL) else {
                    completion(nil, NSError(domain: "HealthExport", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to open file for writing"]))
                    return
                }

                func appendLine<T: Encodable>(_ obj: T) throws {
                    let data = try JSONEncoder().encode(obj)
                    try handle.seekToEnd()
                    handle.write(data)
                    handle.write(Data("\n".utf8))
                }

                // A simplified synchronous query for demonstration.
                // In production use HKAnchoredObjectQuery and stream results per type.
                let semaphore = DispatchSemaphore(value: 0)
                progress("Querying HealthKit...")
                // For demo: write a small example record (replace with real anchored queries)
                let example = CompactRecord(type: "HeartRate", startDate: Int64(startDate.timeIntervalSince1970 * 1000), endDate: Int64(endDate.timeIntervalSince1970 * 1000), value: 72, unit: "count/min", source: "Demo", device: nil, metadata: nil)
                try appendLine(example)

                handle.closeFile()
                progress("Wrote NDJSON to \(ndjsonURL.lastPathComponent)")

                if gzip {
                    let gzURL = docs.appendingPathComponent("\(filenameBase).ndjson.gz")
                    // Use Compression framework via helper to gzip the file
                    try Gzip.compressFile(at: ndjsonURL, to: gzURL)
                    progress("Compressed to \(gzURL.lastPathComponent)")
                    completion(gzURL, nil)
                } else {
                    completion(ndjsonURL, nil)
                }
            } catch {
                completion(nil, error)
            }
        }
    }
}
