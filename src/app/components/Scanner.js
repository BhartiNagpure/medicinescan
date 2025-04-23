"use client";
import { useEffect, useState, useRef } from "react";
import { BrowserMultiFormatReader, mScannerView } from '@zxing/browser';
import { toast } from 'react-hot-toast';
import Tesseract from "tesseract.js";
import JsonToSpeech from "./JsonToSpeech";
const { Configuration, OpenAIApi } = require("openai");
// import { useSpeech } from "react-text-to-speech";
// import { Speaker, Pause, Square } from 'lucide-react';
// import { useSpeechSynthesis } from 'react-speech-kit';


function Scanner({ setShowScanner }) {
    const [scanResult, setScanResult] = useState(null);
    const [isScanning, setIsScanning] = useState(false);
    const [fetchedData, setFetchedData] = useState(null);
    // const [isSpeaking, setIsSpeaking] = useState(false);
    const scannerRef = useRef(null);
    // const { speak, cancel } = useSpeechSynthesis();

    // const startCameraScanner = () => {
    //     return new Promise((resolve, reject) => {
    //         const codeReader = new BrowserMultiFormatReader();
    //         scannerRef.current = codeReader;
    //         setFetchedData(null)
    //         codeReader.decodeFromVideoDevice(
    //             undefined, // Use default camera
    //             'reader',
    //             async (result, error) => {
    //                 if (result) {
    //                     stopScanning();
    //                     console.log("Code detected:", result.text);
    //                     setScanResult(result.text);
    //                     // Stop scanning immediately after detection
    //                     await fetchQrData(result.text);
    //                 }
    //                 if (error && !(error instanceof Error)) {
    //                     console.error("Scanning error:", error);
    //                 }
    //             }
    //         ).then(() => {
    //             setIsScanning(true);
    //             resolve();
    //         }).catch(err => {
    //             setIsScanning(false);
    //             console.error("Camera initialization error:", err);
    //             reject(err);
    //         });
    //     });
    // };
    const startCameraScanner = () => {
        return new Promise((resolve, reject) => {
            const codeReader = new BrowserMultiFormatReader();
            scannerRef.current = codeReader;
            setFetchedData(null)
            codeReader.decodeFromVideoDevice(
                undefined, // Use default camera
                'reader',
                async (result, error) => {
                    if (result) {
                        stopScanning();
                        console.log("Code detected:", result.text);
                        setScanResult(result.text);
                        // Stop scanning immediately after detection
                        await fetchQrData(result.text);
                    }
                    if (error && !(error instanceof Error)) {
                        console.error("Scanning error:", error);
                    }
                }
            ).then(() => {
                setIsScanning(true);
                resolve();
            }).catch(err => {
                setIsScanning(false);
                console.error("Camera initialization error:", err);
                reject(err);
            });
        });
    };

    const stopScanning = () => {
        setIsScanning(false);  // Set scanning state to false

        // If the scanner has a stop method (e.g., for barcode scanner)
        if (scannerRef.current && typeof scannerRef.current.stop === 'function') {
            scannerRef.current.stop();
        }

        // Stopping the video stream if it exists
        const videoElement = document.getElementById('reader');  // Assuming 'reader' is your video element ID
        if (videoElement) {
            const stream = videoElement.srcObject;
            if (stream) {
                stream.getTracks().forEach(track => track.stop());  // Stop all media tracks (video/audio)
            }
            videoElement.srcObject = null;  // Disconnect the video element from the stream
        }
    };


    const scanFromGallery = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const codeReader = new BrowserMultiFormatReader();
        try {
            const imageUrl = URL.createObjectURL(file);
            const hints = new Map();
            hints.set(2, true); // Enable try harder mode
            const result = await codeReader.decodeFromImageUrl(imageUrl);
            console.log("QR code from file:", result.text);
            setScanResult(result.text);

            // Fetch data from the scanned QR code
            await fetchQrData(result.text);
        } catch (err) {
            console.error("Error scanning file:", err);
            setScanResult(null);
            alert("No QR code found in the image. Please try another image.");
        } finally {
            codeReader.reset();
            URL.revokeObjectURL(imageUrl);
        }
    };


    const scanTextFromCamera = async () => {
        try {
            // First start the camera
            await startCameraScanner();

            // Create a new Tesseract worker
            const worker = await Tesseract.createWorker('eng');

            // Wait a moment for camera to initialize
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Get video element and create canvas
            const video = document.getElementById('reader');
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');

            // Set canvas size to video size
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            // Capture frame from video
            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Convert canvas to blob
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
            const imageUrl = URL.createObjectURL(blob);

            // Recognize text
            const { data: { text } } = await worker.recognize(imageUrl);

            // Clean up
            await worker.terminate();
            URL.revokeObjectURL(imageUrl);
            stopScanning();
            console.log("Recognized text:", text);

            if (text.trim()) {
                setScanResult(text.trim());
                await fetchChatCompletion(text.trim());
                // const words = text.trim().split(' ');
                // for (const word of words) {
                //     if (word) {
                //         await fetchQrData(word);
                //     }
                // }
            }

        } catch (error) {
            console.error('Error scanning text:', error);
            toast.error("Error scanning text");
            stopScanning();
        }
    };

    const fetchChatCompletion = async (medicineName) => {
        if (!medicineName.trim()) return;

        const prompt = `
        You are a medical assistant. The user has provided a medicine name: "${medicineName}".
        
        1. Clean and extract the actual medicine name, ignoring any special characters, extra whitespace, numbers, or noise.
        2. Validate if the cleaned medicine name refers to a real and recognized medicine.
        
        Respond only in the following strict JSON format:
        
        {
          "medicine_name": "",
          "uses": "",
          "side_effects": "",
          "precautions": "",
          "dosage": "",
          "interactions": "",
          "storage": ""
        }
        
        - If the medicine is valid, fill all fields with appropriate medical information.
        - If the cleaned name is not recognized, set "medicine_name" to "Not a recognized medicine" and leave the remaining fields as empty strings.
        - Do not include any explanation, extra formatting, or comments. Only output valid JSON.
        `;
        

//         const prompt = `
// Provide detailed information about the medicine "${medicineName}" in the following JSON format:

// {
//   "medicine_name": "",
//   "uses": "",
//   "side_effects": "",
//   "precautions": "",
//   "dosage": "",
//   "interactions": "",
//   "storage": ""
// }

// Only respond with the JSON object. Do not include any extra explanation or formatting.`
//             ;


        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo', // or 'gpt-4' if available
                    messages: [
                        { role: 'system', content: 'You are a helpful medical assistant.' },
                        { role: 'user', content: prompt },
                    ],
                    temperature: 0.5,
                }),
            });

            const data = await response.json();
            const text = data.choices[0]?.message?.content;
            console.log("ChatGPT response:", text);

            // Try to parse JSON
            try {
                const json = JSON.parse(text.trim());
                setFetchedData(json);
            } catch (err) {
                console.error("Failed to parse JSON:", err);
                setFetchedData({ error: "Invalid response format" });
            }
        } catch (error) {
            console.error("Error fetching chat completion:", error);
            toast.error("Failed to fetch chat completion");
        } finally {
            setIsScanning(false);
            stopScanning();
        }
    };

    const fetchQrData = async (name) => {
        try {
            if (!name) {
                console.error("Barcode number is empty");
                return;
            }
            console.log("name ", name)
            // Sanitize and normalize the text
            // const decodedName = encodeURIComponent(name);
            // console.log("decodenam ",decodedName); // Debugging line
            const extractedName = name.match(/^[a-zA-Z0-9]+/)[0].trim(); console.log("topass name:", extractedName);
            const response = await fetch(`/api/getmedicinename?search=${extractedName}`);

            if (!response.ok) {
                throw new Error("Failed to fetch medicine data");
            }

            const data = await response.json();

            // Set the fetched data to display on the frontend
            setFetchedData(data);
            setIsScanning(false);
            stopScanning(); // Stop scanning process

            // Explicitly stop video tracks
            const videoElement = document.getElementById('reader');
            if (videoElement && videoElement.srcObject) {
                const tracks = videoElement.srcObject.getTracks();
                tracks.forEach(track => track.stop());
                videoElement.srcObject = null;
            }

        } catch (error) {
            toast.error("Error fetching medicine data");
            console.error("Error fetching medicine data:", error);
        }
    };




    // const {
    //     Text,
    //     speechStatus,
    //     isInQueue,
    //     start,
    //     pause,
    //     stop,
    // } = useSpeech({
    //     text: fetchedData ?
    //         `Name: ${fetchedData.name}. 
    //              Description: ${fetchedData.description}. 
    //              Dosage: ${fetchedData.dose}. 
    //              Price: ${fetchedData.price} rupees. 
    //              Expiry Date: ${fetchedData.expiry}`
    //         : ''
    // });
    // const readFetchedData = () => {
    //     if (isSpeaking) {
    //         cancel();
    //         setIsSpeaking(false);
    //         return;
    //     }
    //     const textToSpeak = `
    //       Name: ${fetchedData.name}
    //       Description: ${fetchedData.description}
    //       Dosage: ${fetchedData.dose}
    //       Price: ₹ ${fetchedData.price}
    //       Expiry Date: ${fetchedData.expiry}
    //     `;
    //     setIsSpeaking(true);
    //     speak({ 
    //         text: textToSpeak,
    //         onEnd: () => setIsSpeaking(false)
    //     });
    //     speak({ text: textToSpeak });
    // };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 ">

            <div className="flex justify-center items-center space-x-4 py-8">
                {/* QR Code Scanner Block */}
                {
                    !fetchedData ? (
                        <div className="scanner-container bg-white p-6 rounded-lg shadow-lg max-w-lg min-w-[400px w-full relative">
                            <button
                                className="absolute top-2 right-2 text-red-500"
                                onClick={() => { setShowScanner(false); stopScanning(); cancel(); }}
                            >
                                ✖
                            </button>
                            <div className="text-center">
                                {/* Camera Scanner Controls */}
                                <div className="mt-4">
                                    {isScanning ? (
                                        <button
                                            onClick={() => stopScanning()}
                                            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                                        >
                                            Stop Scanning
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => scanTextFromCamera()}
                                            // onClick={startCameraScanner}
                                            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                                        >
                                            Scan with Camera
                                        </button>
                                    )}
                                </div>


                                {/* Image Preview */}
                                <img id="preview" className="mt-4 max-w-full h-48 object-contain hidden" alt="Preview" />

                                {/* QR Code Reader Video */}
                                <video id="reader" className={`mt-6 w-full ${isScanning ? "block " : "hidden"} `}></video>
                            </div>
                        </div>
                    ) : (
                        <div className="result-container bg-white p-6 rounded-lg shadow-lg min-w-[400px] w-full relative">

                            <button
                                className="absolute top-2 right-2 text-red-500 hover:text-red-700"
                                onClick={() => {
                                    setShowScanner(false);
                                    stopScanning()
                                    window.location.reload();// Clear the scan result    
                                }}

                            >
                                ✖
                            </button>
                            <h3 className="text-xl max-w-[500px] font-bold mb-2 text-gray-500 dark:text-gray-300">Scan Result:</h3>
                            {fetchedData && (
                                <div>
                                    <div className="space-y-2">
                                        <p className="text-gray-700 dark:text-gray-300"><strong>Medicine Name:</strong> {fetchedData.medicine_name}</p>
                                        <p className="text-gray-700 dark:text-gray-300"><strong>Uses:</strong> {fetchedData.uses}</p>
                                        <p className="text-gray-700 dark:text-gray-300"><strong>Side Effects:</strong> {fetchedData.side_effects}</p>
                                        <p className="text-gray-700 dark:text-gray-300"><strong>Precautions:</strong> {fetchedData.precautions}</p>
                                        <p className="text-gray-700 dark:text-gray-300"><strong>Dosage:</strong> {fetchedData.dosage}</p>
                                        <p className="text-gray-700 dark:text-gray-300"><strong>Interactions:</strong> {fetchedData.interactions}</p>
                                        <p className="text-gray-700 dark:text-gray-300"><strong>Storage:</strong> {fetchedData.storage}</p>
                                    </div>
                                    <JsonToSpeech data={fetchedData} />
                                    {/* <div className="flex items-center gap-4 mt-4">
                                  <button onClick={readFetchedData} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-100 hover:bg-blue-200 transition-colors">
                                    <Speaker size={24} className="text-blue-600" />
                                    <span className="text-blue-600">Speak</span>
                                    </button>
                                    <button
                                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-100 hover:bg-red-200 transition-colors"
                                            onClick={cancel}
                                        >
                                            <Square size={24} className="text-red-600" />
                                            <span className="text-red-600">Stop</span>
                                        </button>
                                    </div> */}
                                    {/* <button onClick={readFetchedData} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-100 hover:bg-blue-200 transition-colors">
                                    <Speaker size={24} className="text-blue-600" />
                                    <span className="text-blue-600">Speak</span>
                                    </button> */}
                                    {/* <div className="flex items-center gap-4 mt-4">
                                        <button
                                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-100 hover:bg-blue-200 transition-colors"
                                            onClick={speechStatus !== "started" ? start : pause}
                                        >
                                            {speechStatus !== "started" ? (
                                                <>
                                                    <Speaker size={24} className="text-blue-600" />
                                                    <span className="text-blue-600">Speak</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Pause size={24} className="text-blue-600" />
                                                    <span className="text-blue-600">Pause</span>
                                                </>
                                            )}
                                        </button>

                                        <button
                                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-100 hover:bg-red-200 transition-colors"
                                            onClick={stop}
                                        >
                                            <Square size={24} className="text-red-600" />
                                            <span className="text-red-600">Stop</span>
                                        </button>
                                    </div> */}
                                </div>
                            )}
                        </div>
                    )
                }
            </div>
        </div>

    );
}

export default Scanner;