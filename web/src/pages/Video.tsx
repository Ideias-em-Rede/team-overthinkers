import "./Video.css";

const DRIVE_FILE_ID = "1ou59z8nVdpKSP6XikCf2ZUIX8xUyQV7N";

export default function Video() {
  return (
    <div className="video-page">
      <h1 className="video-page__title">Vídeo de apresentação</h1>
      <div className="video-page__player">
        <iframe
          src={`https://drive.google.com/file/d/${DRIVE_FILE_ID}/preview`}
          title="Vídeo de apresentação"
          allow="autoplay; fullscreen"
          allowFullScreen
        />
      </div>
    </div>
  );
}
