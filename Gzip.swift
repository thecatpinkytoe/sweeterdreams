import Foundation
import Compression

enum Gzip {
    // Compress a file using zlib/gzip using the Compression framework.
    static func compressFile(at srcURL: URL, to dstURL: URL) throws {
        let data = try Data(contentsOf: srcURL)
        let compressed = try compress(data: data)
        try compressed.write(to: dstURL)
    }

    static func compress(data: Data) throws -> Data {
        return try perform(data: data, operation: COMPRESSION_STREAM_ENCODE, algorithm: COMPRESSION_ZLIB)
    }

    static func perform(data: Data, operation: compression_stream_operation, algorithm: compression_algorithm) throws -> Data {
        var stream = compression_stream()
        var status = compression_stream_init(&stream, operation, algorithm)
        guard status != COMPRESSION_STATUS_ERROR else { throw NSError(domain: "Gzip", code: 1, userInfo: nil) }
        defer { compression_stream_destroy(&stream) }

        let dstBufferSize = 64 * 1024
        let dstBuffer = UnsafeMutablePointer<UInt8>.allocate(capacity: dstBufferSize)
        defer { dstBuffer.deallocate() }

        return try data.withUnsafeBytes { (srcBuffer: UnsafeRawBufferPointer) -> Data in
            var output = Data()
            stream.src_ptr = srcBuffer.bindMemory(to: UInt8.self).baseAddress!
            stream.src_size = srcBuffer.count
            stream.dst_ptr = dstBuffer
            stream.dst_size = dstBufferSize

            while true {
                status = compression_stream_process(&stream, 0)
                switch status {
                case COMPRESSION_STATUS_OK:
                    if stream.dst_size == 0 {
                        output.append(dstBuffer, count: dstBufferSize)
                        stream.dst_ptr = dstBuffer
                        stream.dst_size = dstBufferSize
                    } else {
                        let written = dstBufferSize - stream.dst_size
                        if written > 0 { output.append(dstBuffer, count: written) }
                        stream.dst_ptr = dstBuffer
                        stream.dst_size = dstBufferSize
                    }
                case COMPRESSION_STATUS_END:
                    let written = dstBufferSize - stream.dst_size
                    if written > 0 { output.append(dstBuffer, count: written) }
                    return output
                default:
                    throw NSError(domain: "Gzip", code: 2, userInfo: nil)
                }
            }
        }
    }
}
