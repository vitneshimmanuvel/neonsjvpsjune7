import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBLYtTJtHGfIaIkdi5Qw41wm6sD-tEpGZQ",
  authDomain: "sjvps-5a7f0.firebaseapp.com",
  projectId: "sjvps-5a7f0",
  storageBucket: "sjvps-5a7f0.firebasestorage.app",
  messagingSenderId: "195226208341",
  appId: "1:195226208341:web:d8c0e179e136b4369e2cdc",
  measurementId: "G-6NQGNFC8PQ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function inspectRow98() {
  const registerId = "1778240963004";
  
  // 1. Fetch register metadata & columns
  const regSnap = await getDoc(doc(db, 'registers', registerId));
  if (!regSnap.exists()) {
    console.error("Register not found!");
    process.exit(1);
  }
  const regData = regSnap.data();
  console.log(`Register Name: ${regData.name}`);
  console.log(`Total Columns: ${regData.columns?.length || 0}`);
  
  // Print all column names and IDs to find "Acknowledgement"
  const columns = regData.columns || [];
  columns.forEach(col => {
    console.log(`Col ID: ${col.id} | Name: ${col.name} | Type: ${col.type}`);
  });

  // 2. Fetch Chunk 1 (which holds rows 51 to 100)
  const chunk1Snap = await getDoc(doc(db, 'registers', registerId, 'chunks', '1'));
  if (!chunk1Snap.exists()) {
    console.error("Chunk 1 not found!");
  } else {
    const chunkData = chunk1Snap.data();
    console.log(`\nInspecting Chunk 1 entries:`);
    const entries = chunkData.entries || [];
    
    // Find entry with rowNumber === 98
    const entry98 = entries.find(e => e.rowNumber === 98);
    if (entry98) {
      console.log(`\nFound Entry with rowNumber 98:`);
      console.log(`ID: ${entry98.id}`);
      console.log(`CreatedAt: ${entry98.createdAt}`);
      console.log(`Cells:`, JSON.stringify(entry98.cells, null, 2));
    } else {
      console.log(`\nEntry with rowNumber 98 not found in Chunk 1. Listing all entries in Chunk 1:`);
      entries.forEach(e => {
        console.log(`Row #${e.rowNumber}: ID=${e.id}`);
      });
    }
  }

  process.exit(0);
}

inspectRow98().catch(console.error);
