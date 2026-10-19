(function(){
  'use strict';
  const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const valid=p=>typeof p.latitude==='number'&&typeof p.longitude==='number'&&Number.isFinite(p.latitude)&&Number.isFinite(p.longitude);
  let configPromise;
  async function config(){
    if(!configPromise)configPromise=fetch('/api/map-config').then(r=>{if(!r.ok)throw Error();return r.json();});
    return configPromise;
  }
  async function create(container,{price,card,onSelect=()=>{}}={}){
    if(!window.L)throw new Error('地图组件未能加载，请刷新页面；房源列表仍可使用。');
    const settings=await config(), L=window.L;
    const map=L.map(container,{scrollWheelZoom:false}).setView([-36.79,174.7],11);
    const attribution=esc(settings.attribution||'© OpenStreetMap contributors')+' · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">Map licence</a>';
    const tile=L.tileLayer(settings.tile_url,{attribution,maxZoom:19,referrerPolicy:'strict-origin-when-cross-origin'}).addTo(map);
    const notice=document.createElement('div');notice.className='map-tile-notice';notice.hidden=true;notice.textContent=window.TP?.lang==='en'?'Map background unavailable. Saved home locations are still shown.':'地图底图暂时无法加载；已保存的房源位置仍会显示。';container.append(notice);
    tile.on('tileerror',()=>{notice.hidden=false;});tile.on('tileload',()=>{notice.hidden=true;});
    const layer=L.layerGroup().addTo(map);let items=[],markers=new Map();
    function popup(rows){
      const div=document.createElement('div');div.className='home-map-popup';
      if(card)div.innerHTML=rows.map(card).join('');
      else div.textContent=rows.map(p=>p.address||p.title||'').join(' / ');
      return div;
    }
    function draw(){
      layer.clearLayers();markers=new Map();const groups=new Map();
      for(const p of items){const point=map.project([p.latitude,p.longitude]),key=Math.floor(point.x/66)+':'+Math.floor(point.y/48);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);}
      for(const rows of groups.values()){
        const pos=[rows.reduce((s,p)=>s+p.latitude,0)/rows.length,rows.reduce((s,p)=>s+p.longitude,0)/rows.length];
        const label=rows.length>1?String(rows.length):price?price(rows[0]):'●';
        const marker=L.marker(pos,{icon:L.divIcon({className:'home-map-marker'+(rows.length>1?' home-map-cluster':''),html:`<span>${esc(label)}</span>`,iconSize:null}),title:rows.length>1?`${rows.length} homes`:rows[0].address||rows[0].title,keyboard:true}).addTo(layer);
        marker.bindPopup(popup(rows),{maxWidth:310,minWidth:230});
        marker.on('click',()=>{onSelect(rows.map(p=>p.id));if(rows.length>1&&map.getZoom()<18){marker.closePopup();map.setView(pos,Math.min(map.getZoom()+2,18));}});
        rows.forEach(p=>markers.set(p.id,marker));
      }
    }
    map.on('zoomend',draw);
    return {
      map,
      setItems(rows,{fit=true}={}){items=rows.filter(valid);draw();if(fit&&items.length){map.fitBounds(L.latLngBounds(items.map(p=>[p.latitude,p.longitude])),{padding:[44,44],maxZoom:15,animate:false});draw();}},
      focus(id){const p=items.find(p=>p.id===Number(id));if(!p)return;map.setView([p.latitude,p.longitude],17,{animate:false});draw();markers.get(p.id)?.openPopup();onSelect([p.id]);},
      resize(){map.invalidateSize();},
      destroy(){map.remove();}
    };
  }
  window.TPPropertyMap={create,config,valid};
})();
