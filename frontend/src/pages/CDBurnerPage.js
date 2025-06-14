// frontend/src/pages/CDBurnerPage.js

import React, { useState, useEffect, useCallback, useRef } from 'react'; // Import useRef
import axios from 'axios';
import AlbumGallery from '../components/AlbumGallery'; // Assuming AlbumGallery.js is in components
import Message from '../components/Message'; // Assuming Message.js is in components
// You might need to import LoadingSpinner or similar if you have one
// import LoadingSpinner from '../components/LoadingSpinner';

function CDBurnerPage() {
    const [downloadedItems, setDownloadedItems] = useState([]);
    const [selectedItem, setSelectedItem] = useState(null); // The item chosen to burn
    const [burnerStatus, setBurnerStatus] = useState({
        is_burning: false,
        current_status: 'Initializing...',
        progress_percentage: 0,
        last_error: null,
        burner_detected: false,
        disc_present: false,
        disc_blank_or_erasable: false
    });
    const [message, setMessage] = useState(null); // For general page messages
    const [isLoadingItems, setIsLoadingItems] = useState(true);
    const [isBurningInitiating, setIsBurningInitiating] = useState(false); // For showing loading state on burn button

    const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000'; // Ensure this matches your backend Flask URL

    // --- Effect for clearing messages after a timeout ---
    useEffect(() => {
        if (message) {
            const timer = setTimeout(() => {
                setMessage(null);
            }, 3000); // Message will disappear after 3 seconds

            return () => clearTimeout(timer); // Cleanup the timer if the component unmounts or message changes
        }
    }, [message]); // Re-run this effect whenever the 'message' state changes


    // Use a ref to store the current message value without making pollBurnerStatus re-create
    const messageRef = useRef(message);
    useEffect(() => {
        messageRef.current = message;
    }, [message]);


    // --- Fetch Downloaded Items from Backend ---
    const fetchDownloadedItems = useCallback(async () => {
        setIsLoadingItems(true);
        try {
            const response = await axios.get(`${API_BASE_URL}/api/albums`);
            setDownloadedItems(response.data);
            // Access message via ref to avoid dependency
            if (!messageRef.current || messageRef.current.text !== `Loaded ${response.data.length} downloaded items.`) {
                setMessage({ type: 'success', text: `Loaded ${response.data.length} downloaded items.` });
            }
        } catch (error) {
            console.error('Error fetching downloaded items:', error);
            if (!messageRef.current || messageRef.current.text !== 'Failed to load downloaded items. Please try again.') {
                setMessage({ type: 'error', text: 'Failed to load downloaded items. Please try again.' });
            }
        } finally {
            setIsLoadingItems(false);
        }
    }, [API_BASE_URL]); // Removed message from dependency array

    // --- Poll Burner Status from Backend ---
    const pollBurnerStatus = useCallback(async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/api/cd-burner/status`);
            setBurnerStatus(response.data);

            // Access message via ref to avoid re-creating pollBurnerStatus on message change
            if (response.data.last_error && (!messageRef.current || messageRef.current.text !== `Burner Error: ${response.data.last_error}`)) {
                setMessage({ type: 'error', text: `Burner Error: ${response.data.last_error}` });
            } else if (response.data.current_status === 'Completed' && response.data.progress_percentage === 100 && (!messageRef.current || messageRef.current.text !== 'CD Burning Completed Successfully!')) {
                setMessage({ type: 'success', text: 'CD Burning Completed Successfully!' });
            } else if (response.data.current_status === 'Burner Ready' && (!messageRef.current || messageRef.current.text !== 'CD Burner is ready to burn!')) {
                setMessage({ type: 'info', text: 'CD Burner is ready to burn!' });
            } else if (response.data.current_status === 'No Burner Detected' && (!messageRef.current || messageRef.current.text !== 'No CD Burner detected. Please ensure it is connected.')) {
                setMessage({ type: 'warning', text: 'No CD Burner detected. Please ensure it is connected.' });
            } else if (response.data.current_status === 'No Disc' && (!messageRef.current || messageRef.current.text !== 'No disc found in burner. Please insert a blank CD.')) {
                setMessage({ type: 'warning', text: 'No disc found in burner. Please insert a blank CD.' });
            } else if (response.data.current_status === 'Disc Not Blank/Erasable' && (!messageRef.current || messageRef.current.text !== 'Disc is not blank or erasable. Please insert a new blank CD.')) {
                setMessage({ type: 'warning', text: 'Disc is not blank or erasables. Please insert a new blank CD.' });
            }
        } catch (error) {
            console.error('Error polling burner status:', error);
            if (!messageRef.current || messageRef.current.text !== 'Failed to connect to CD burner service.') {
                setMessage({ type: 'error', text: 'Failed to connect to CD burner service.' });
            }
            setBurnerStatus(prev => ({
                ...prev,
                current_status: 'Connection Error',
                last_error: 'Could not fetch burner status.'
            }));
        }
    }, [API_BASE_URL]); // Removed message from dependency array

    // --- Effect for initial fetch and polling ---
    useEffect(() => {
        fetchDownloadedItems();

        // Initial status check
        pollBurnerStatus();

        // Set up polling interval (e.g., every 3 seconds)
        const statusInterval = setInterval(() => {
            pollBurnerStatus();
        }, 3000);

        // Cleanup interval on component unmount
        return () => clearInterval(statusInterval);
    }, [fetchDownloadedItems, pollBurnerStatus]); // Dependencies for useEffect


    // --- Event Handlers ---
    const handleSelectItem = (item) => {
        // Toggle selection: if the clicked item is already selected, deselect it. Otherwise, select it.
        if (selectedItem && selectedItem.id === item.id) {
            setSelectedItem(null); // Deselect
        } else {
            setSelectedItem(item); // Select new item
        }
        // Removed the message display for selected item, as visual border is sufficient
    };

    const handleBurnCD = async () => {
        if (!selectedItem) {
            if (!messageRef.current || messageRef.current.text !== 'Please select an item to burn first.') {
                setMessage({ type: 'error', text: 'Please select an item to burn first.' });
            }
            return;
        }

        if (burnerStatus.is_burning) {
            if (!messageRef.current || messageRef.current.text !== 'A burning process is already active. Please wait.') {
                setMessage({ type: 'warning', text: 'A burning process is already active. Please wait.' });
            }
            return;
        }

        if (!burnerStatus.burner_detected || !burnerStatus.disc_present || !burnerStatus.disc_blank_or_erasable) {
            if (!messageRef.current || messageRef.current.text !== 'CD Burner not ready. Please check status.') {
                setMessage({ type: 'error', text: 'CD Burner not ready. Please check status.' });
            }
            return;
        }

        setIsBurningInitiating(true);
        if (!messageRef.current || messageRef.current.text !== `Initiating burn for ${selectedItem.name}...`) {
            setMessage({ type: 'info', text: `Initiating burn for ${selectedItem.name}...` });
        }
        try {
            const response = await axios.post(`${API_BASE_URL}/api/cd-burner/burn`, {
                download_item_id: selectedItem.id,
            });
            if (!messageRef.current || messageRef.current.text !== (response.data.message || 'CD burn initiated!')) {
                setMessage({ type: 'success', text: response.data.message || 'CD burn initiated!' });
            }
            // Polling will pick up the status change
        } catch (error) {
            console.error('Error initiating CD burn:', error);
            let errorMessage = 'Failed to initiate CD burn.';
            if (error.response && error.response.data && error.response.data.error) {
                errorMessage = error.response.data.error;
            }
            if (!messageRef.current || messageRef.current.text !== errorMessage) {
                setMessage({ type: 'error', text: errorMessage });
            }
        } finally {
            setIsBurningInitiating(false);
        }
    };


    // --- Render Logic ---
    const isBurnButtonDisabled =
        !selectedItem ||
        burnerStatus.is_burning ||
        !burnerStatus.burner_detected ||
        !burnerStatus.disc_present ||
        !burnerStatus.disc_blank_or_erasable ||
        isBurningInitiating;

    const getBurnerStatusColor = () => {
        if (burnerStatus.is_burning) return 'text-yellow-500';
        if (burnerStatus.last_error) return 'text-red-500';
        if (burnerStatus.current_status === 'Completed') return 'text-green-500';
        if (burnerStatus.current_status === 'Burner Ready') return 'text-green-500';
        return 'text-gray-400';
    };


    return (
        <div className="min-h-screen bg-gray-900 text-white">

            <main className="container mx-auto p-6">
                <h1 className="text-3xl font-bold mb-6 text-center">CD Burner</h1>

                {message && (
                    <div className="mb-4">
                        <Message type={message.type} text={message.text} />
                    </div>
                )}

                <div className="bg-gray-800 rounded-lg shadow-md p-6 mb-8">
                    <h2 className="text-xl font-semibold mb-4">CD Burner Status</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-300">
                        <div>
                            <p>Status: <span className={getBurnerStatusColor()}>{burnerStatus.current_status}</span></p>
                            {burnerStatus.is_burning && (
                                <p>Progress: <span className="text-blue-400">{burnerStatus.progress_percentage}%</span></p>
                            )}
                            {burnerStatus.last_error && (
                                <p className="text-red-500">Error: {burnerStatus.last_error}</p>
                            )}
                        </div>
                        <div>
                            <p>Burner Detected: <span className={burnerStatus.burner_detected ? 'text-green-400' : 'text-red-400'}>{burnerStatus.burner_detected ? 'Yes' : 'No'}</span></p>
                            <p>Disc Present: <span className={burnerStatus.disc_present ? 'text-green-400' : 'text-red-400'}>{burnerStatus.disc_present ? 'Yes' : 'No'}</span></p>
                            <p>Disc Blank/Erasable: <span className={burnerStatus.disc_blank_or_erasable ? 'text-green-400' : 'text-red-400'}>{burnerStatus.disc_blank_or_erasable ? 'Yes' : 'No'}</span></p>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-800 rounded-lg shadow-md p-6 mb-8">
                    <h2 className="text-xl font-semibold mb-4">Select Item to Burn</h2>
                    {isLoadingItems ? (
                        <p className="text-gray-400 text-center">Loading downloaded items...</p>
                        // Or use your LoadingSpinner component here
                        // <LoadingSpinner />
                    ) : downloadedItems.length === 0 ? (
                        <p className="text-gray-400 text-center">No downloaded items found. Please download some content first.</p>
                    ) : (
                        <>
                            <p className="text-gray-300 mb-4">Click an album/playlist/track below to select it for burning. Click again to deselect.</p>
                            <AlbumGallery
                                albums={downloadedItems}
                                onAlbumClick={handleSelectItem} // Pass a new handler for selection
                                selectedAlbumId={selectedItem ? selectedItem.id : null} // Pass selected ID for styling
                                pageType="burn-selection" // A new pageType to adjust AlbumCard behavior if needed
                            />
                        </>
                    )}
                </div>

                <div className="text-center">
                    <button
                        onClick={handleBurnCD}
                        disabled={isBurnButtonDisabled}
                        className={`py-3 px-8 rounded-lg text-lg font-bold transition duration-200
                            ${isBurnButtonDisabled
                                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                : 'bg-green-600 hover:bg-green-700 text-white'
                            }`}
                    >
                        {isBurningInitiating ? 'Initiating Burn...' :
                            burnerStatus.is_burning ? `Burning (${burnerStatus.progress_percentage}%)` :
                            'Start CD Burn'}
                    </button>
                </div>
            </main>
        </div>
    );
}

export default CDBurnerPage;