import React, {
  useRef,
  useState,
} from "react";


export default function ImageUploader({
  label,
  file,
  onChange,
}) {
  const inputRef = useRef(null);

  const [dragging, setDragging] =
    useState(false);


  const selectFile = () => {
    inputRef.current?.click();
  };


  const handleFile = (
    selectedFile
  ) => {
    if (!selectedFile) {
      return;
    }

    if (
      !selectedFile.type.startsWith(
        "image/"
      )
    ) {
      alert(
        "Please select a valid image file."
      );

      return;
    }

    onChange(selectedFile);
  };


  const handleInput =
    (event) => {
      handleFile(
        event.target.files?.[0]
      );
    };


  const handleDrop =
    (event) => {
      event.preventDefault();

      setDragging(false);

      handleFile(
        event.dataTransfer
          .files?.[0]
      );
    };


  const previewUrl =
    file
      ? URL.createObjectURL(
          file
        )
      : null;


  return (
    <div
      className={`premium-uploader ${
        dragging
          ? "premium-uploader-dragging"
          : ""
      }`}
      onClick={selectFile}
      onDragOver={(event) => {
        event.preventDefault();

        setDragging(true);
      }}
      onDragLeave={() =>
        setDragging(false)
      }
      onDrop={handleDrop}
    >

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={
          handleInput
        }
      />


      {previewUrl ? (

        <div className="premium-uploader-preview">

          <img
            src={previewUrl}
            alt={label}
          />


          <div className="premium-uploader-preview-overlay">

            <span>
              Replace Image
            </span>

          </div>

        </div>

      ) : (

        <div className="premium-uploader-empty">

          <div className="premium-uploader-icon">
            +
          </div>


          <strong>
            {label}
          </strong>


          <span>
            Click or drag image
          </span>

        </div>

      )}


      <div className="premium-uploader-label">
        {label}
      </div>

    </div>
  );
}