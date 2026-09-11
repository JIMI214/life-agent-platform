export default function manifest(){
  return {
    name:'Life Agent', short_name:'Life Agent', description:'Context-aware multimodal personal life agent platform',
    start_url:'/', display:'standalone', background_color:'#000000', theme_color:'#000000',
    icons:[{src:'/icon-192.png',sizes:'192x192',type:'image/png'},{src:'/icon-512.png',sizes:'512x512',type:'image/png'}]
  };
}
