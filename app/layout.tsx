import type { Metadata,Viewport } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Долги — личные взаиморасчеты',description:'Быстрая запись долгов, возвраты и взаимозачеты. Каждая валюта отдельно.',manifest:'/manifest.webmanifest',icons:{icon:'/favicon.svg',apple:'/icon-192.png'},appleWebApp:{capable:true,statusBarStyle:'default',title:'Долги'}};
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#f7f5f0'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ru"><body>{children}</body></html>}
