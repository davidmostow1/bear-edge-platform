import CoreGraphics
import Foundation
import ImageIO
import Vision

func fail(_ message: String, _ code: Int32 = 1) -> Never {
  FileHandle.standardError.write(Data((message + "\n").utf8))
  exit(code)
}

let arguments = CommandLine.arguments

guard arguments.count >= 2 else {
  fail("Usage: vision-ocr <image-path>", 64)
}

let imagePath = arguments[1]
let imageUrl = URL(fileURLWithPath: imagePath)

guard
  let imageSource = CGImageSourceCreateWithURL(imageUrl as CFURL, nil),
  let image = CGImageSourceCreateImageAtIndex(imageSource, 0, nil)
else {
  fail("Unable to load image for OCR: \(imagePath)", 66)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
request.recognitionLanguages = ["en-US"]

let handler = VNImageRequestHandler(cgImage: image, options: [:])

do {
  try handler.perform([request])
} catch {
  fail("Vision OCR failed: \(error.localizedDescription)", 70)
}

let observations = request.results ?? []
let lines = observations.compactMap { observation in
  observation.topCandidates(1).first?.string
}

print(lines.joined(separator: "\n"))
