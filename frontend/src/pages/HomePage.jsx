import {
  useEffect,
  useState,
} from "react";

import { useNavigate }
  from "react-router-dom";

import Sidebar
  from "../components/Sidebar";

import DesignGrid
  from "../components/DesignGrid";

import {
  getCategories,
  getDesigns,
} from "../services/api";


export default function HomePage() {

  const navigate =
    useNavigate();

  const [
    categories,
    setCategories,
  ] = useState([]);

  const [
    selectedCategory,
    setSelectedCategory,
  ] = useState(null);

  const [
    designs,
    setDesigns,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);


  useEffect(() => {

    loadInitialData();

  }, []);


  const loadInitialData =
    async () => {

      try {

        const categoryData =
          await getCategories();

        setCategories(
          categoryData
        );

        if (
          categoryData.length > 0
        ) {

          const firstCategory =
            categoryData[0];

          setSelectedCategory(
            firstCategory
          );

          const designData =
            await getDesigns(
              firstCategory.id
            );

          setDesigns(
            designData
          );
        }

      } catch (error) {

        console.error(
          "Failed loading data:",
          error
        );

      } finally {

        setLoading(false);
      }
    };


  const handleCategorySelect =
    async (category) => {

      setSelectedCategory(
        category
      );

      try {

        const designData =
          await getDesigns(
            category.id
          );

        setDesigns(
          designData
        );

      } catch (error) {

        console.error(
          error
        );
      }
    };


  return (

    <div className="portal-layout">

      <Sidebar
        categories={categories}
        selectedCategory={
          selectedCategory
        }
        onSelect={
          handleCategorySelect
        }
      />


      <main className="portal-content">

        <div className="page-header">

          <span>
            Explore Collection
          </span>

          <h1>
            {
              selectedCategory
                ?.name ||
              "Fashion Collection"
            }
          </h1>

          <p>
            Select a design to create
            your personalized AI fashion
            preview.
          </p>

        </div>


        {loading ? (

          <div className="loading">
            Loading designs...
          </div>

        ) : (

          <DesignGrid

            designs={designs}

            onDesignClick={
              (design) =>
                navigate(
                  `/design/${design.id}`
                )
            }

          />

        )}

      </main>

    </div>
  );
}