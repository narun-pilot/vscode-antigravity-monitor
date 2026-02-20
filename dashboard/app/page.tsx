import Dashboard from '@/components/Dashboard';
import { UserData } from '@/app/lib/types';
import fs from 'fs';
import path from 'path';

function getData(): UserData[] {
  const dataDir = path.join(process.cwd(), 'app/data');
  const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));
  
  let allUsers: UserData[] = [];

  files.forEach(file => {
    const filePath = path.join(dataDir, file);
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const jsonData = JSON.parse(fileContent);

      if (Array.isArray(jsonData)) {
        allUsers = [...allUsers, ...jsonData];
      } else {
        // Handle single object export
        // Ensure strictly typed as UserData or close enough
        const user = jsonData as any;
        if (user.userId && user.email) {
             // Generate avatar if missing
             if (!user.avatarUrl) {
                 user.avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.userId}`;
             }
             allUsers.push(user);
        }
      }
    } catch (e) {
      console.error(`Error reading data file ${file}:`, e);
    }
  });

  // Deduplicate by userId if necessary (optional, but good practice)
  const uniqueUsers = Array.from(new Map(allUsers.map(u => [u.userId, u])).values());
  return uniqueUsers as UserData[];
}

export default function Home() {
  const data = getData();

  return (
    <main>
      <Dashboard initialData={data} />
    </main>
  );
}
