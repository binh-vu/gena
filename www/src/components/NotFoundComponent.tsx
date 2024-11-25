import { routeAPIs, NoArgsPathDef } from "../routing";
import styles from "./NotFoundComponent.module.css";
import { useNavigate } from "react-router";

const homePath = new NoArgsPathDef({
  component: () => null,
  pathDef: "/",
}).path();

const NotFoundComponent = () => {
  const navigate = useNavigate();

  return (
    <div className={styles.container}>
      <div className={styles.title}>404</div>
      <div className={styles.subTitle}>
        Sorry, the page you visited does not exist.
      </div>
      <div className={styles.navigation}>
        <button
          className={styles.btn}
          onClick={() => routeAPIs.goBack(navigate)}
        >
          Back
        </button>
        <button
          className={styles.btn}
          onClick={homePath.getMouseClickNavigationHandler(navigate)}
        >
          Home
        </button>
      </div>
    </div>
  );
};

export default NotFoundComponent;
