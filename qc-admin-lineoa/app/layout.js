import './globals.css';
import ScraperGlobalScheduler from './components/ScraperGlobalScheduler';
import ScraperStatusFloat from './components/ScraperStatusFloat';

export const metadata = { title: 'QC Admin Line OA', description: 'LINE OA Admin Quality Control' };

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>
        <ScraperGlobalScheduler />
        <ScraperStatusFloat />
        {children}
      </body>
    </html>
  );
}
